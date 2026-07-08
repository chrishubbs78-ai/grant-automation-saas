const { Op } = require('sequelize');
const { Grant, Outcome, Draft, Analytics, Organization, ReapplyCandidate } = require('../models');
const { generateImprovedDraft } = require('./claudeService');
const logger = require('../utils/logger');

// How many days before the estimated next cycle a candidate becomes eligible
const REAPPLY_LEAD_DAYS = parseInt(process.env.REAPPLY_LEAD_DAYS || '60', 10);

// Most grant programs run annual cycles; estimate next deadline as +1 year
function estimateNextCycleDate(deadline) {
  if (!deadline) return null;
  const next = new Date(deadline);
  next.setFullYear(next.getFullYear() + 1);
  return next;
}

function isWithinLeadWindow(nextCycleDate, now = new Date()) {
  if (!nextCycleDate) return false;
  const leadMs = REAPPLY_LEAD_DAYS * 24 * 60 * 60 * 1000;
  return new Date(nextCycleDate).getTime() - now.getTime() <= leadMs;
}

/**
 * Create a reapply candidate for a rejected grant.
 * Called when a rejection outcome is recorded, and by detectCandidates().
 */
async function createCandidateForGrant(grant, outcome, orgId) {
  // Don't duplicate candidates for the same grant
  const existing = await ReapplyCandidate.findOne({ where: { grant_id: grant.id } });
  if (existing) return existing;

  const nextCycleDate = estimateNextCycleDate(grant.deadline);
  const status = isWithinLeadWindow(nextCycleDate) ? 'eligible' : 'pending';

  const candidate = await ReapplyCandidate.create({
    org_id: orgId,
    grant_id: grant.id,
    funder_name: grant.funder_name,
    status,
    next_cycle_date: nextCycleDate,
    rejection_notes: outcome?.notes || '',
    improvement_context: {
      original_deadline: grant.deadline,
      original_amount: grant.amount,
      rejection_date: outcome?.outcome_date || null
    },
    last_checked_at: new Date()
  });

  logger.info({ candidateId: candidate.id, grantId: grant.id, status }, 'Reapply candidate created');
  return candidate;
}

/**
 * Scan an org's rejected grants and create candidates for any not yet tracked.
 */
async function detectCandidates(orgId) {
  const rejectedGrants = await Grant.findAll({
    where: { org_id: orgId, status: 'rejected', parent_grant_id: null },
    include: [{ association: 'outcome' }, { association: 'reapplyCandidate' }]
  });

  const created = [];
  for (const grant of rejectedGrants) {
    if (grant.reapplyCandidate) continue;
    const candidate = await createCandidateForGrant(grant, grant.outcome, orgId);
    created.push(candidate);
  }

  return created;
}

/**
 * Move pending candidates to eligible once their next cycle is within the lead window.
 * If orgId is omitted, refreshes across all orgs (scheduler use).
 */
async function refreshEligibility(orgId = null) {
  const where = { status: 'pending', next_cycle_date: { [Op.ne]: null } };
  if (orgId) where.org_id = orgId;

  const pending = await ReapplyCandidate.findAll({ where });
  const now = new Date();
  const becameEligible = [];

  for (const candidate of pending) {
    if (isWithinLeadWindow(candidate.next_cycle_date, now)) {
      await candidate.update({ status: 'eligible', last_checked_at: now });
      becameEligible.push(candidate);
    } else {
      await candidate.update({ last_checked_at: now });
    }
  }

  return becameEligible;
}

/**
 * Gather everything the AI needs to write a better draft this time:
 * previous draft, rejection feedback, and learning-engine recommendations.
 */
async function buildImprovementContext(candidate) {
  const grant = await Grant.findByPk(candidate.grant_id, {
    include: [{ association: 'outcome' }]
  });

  const previousDraft = await Draft.findOne({
    where: { grant_id: candidate.grant_id },
    order: [['version', 'DESC']]
  });

  const analytics = await Analytics.findOne({ where: { org_id: candidate.org_id } });

  return {
    grant,
    previousDraft: previousDraft ? previousDraft.get({ plain: true }) : null,
    rejectionFeedback: candidate.rejection_notes || grant?.outcome?.notes || '',
    recommendations: analytics?.recommendations || []
  };
}

/**
 * Execute a reapply: create the new grant linked to the original and generate
 * an improved draft that addresses the rejection feedback.
 */
async function executeReapply(candidateId, orgId) {
  const candidate = await ReapplyCandidate.findOne({
    where: { id: candidateId, org_id: orgId }
  });

  if (!candidate) {
    throw new Error('Reapply candidate not found');
  }
  if (candidate.status === 'reapplied') {
    throw new Error('Candidate has already been reapplied');
  }
  if (candidate.status === 'dismissed') {
    throw new Error('Candidate has been dismissed');
  }

  const org = await Organization.findByPk(orgId);
  if (!org) {
    throw new Error('Organization not found');
  }

  const context = await buildImprovementContext(candidate);
  const originalGrant = context.grant;
  if (!originalGrant) {
    throw new Error('Original grant not found');
  }

  // Create the new grant linked to the original
  const newGrant = await Grant.create({
    org_id: orgId,
    funder_name: originalGrant.funder_name,
    deadline: candidate.next_cycle_date,
    amount: originalGrant.amount,
    status: 'draft',
    rfp_analysis: originalGrant.rfp_analysis,
    parent_grant_id: originalGrant.id,
    reapply_count: (originalGrant.reapply_count || 0) + 1,
    notes: `Reapplication of grant ${originalGrant.id} (rejected). Auto-generated improved draft.`
  });

  // Generate an improved draft using the rejection as a learning signal.
  // Pass the full profile — buildOrgContext uses programs, outcomes, financials,
  // and the business plan, not just name/mission.
  const improvedDraft = await generateImprovedDraft({
    orgProfile: org.get({ plain: true }),
    rfpAnalysis: originalGrant.rfp_analysis || {},
    previousDraft: context.previousDraft,
    rejectionFeedback: context.rejectionFeedback,
    recommendations: context.recommendations
  });

  const previousVersion = context.previousDraft?.version || 0;
  const draftRecord = await Draft.create({
    grant_id: newGrant.id,
    org_id: orgId,
    version: previousVersion + 1,
    problem_statement: improvedDraft.problem_statement || '',
    impact_statement: improvedDraft.impact_statement || '',
    budget_narrative: improvedDraft.budget_narrative || ''
  });

  await newGrant.update({ draft_sections: improvedDraft });

  await candidate.update({
    status: 'reapplied',
    new_grant_id: newGrant.id,
    reapplied_at: new Date(),
    improvement_context: {
      ...(candidate.improvement_context || {}),
      improvement_summary: improvedDraft.improvement_summary || null,
      new_draft_id: draftRecord.id
    }
  });

  logger.info({ candidateId, newGrantId: newGrant.id }, 'Reapply executed');

  return {
    candidate: candidate.get({ plain: true }),
    grant: newGrant.get({ plain: true }),
    draft: draftRecord.get({ plain: true }),
    improvement_summary: improvedDraft.improvement_summary || null
  };
}

/**
 * Scheduler entry point: detect new candidates, refresh eligibility, and
 * auto-execute any eligible candidates that have auto_reapply enabled.
 */
async function runScheduledReapplyCheck() {
  const results = { detected: 0, becameEligible: 0, autoReapplied: 0, errors: [] };

  try {
    const orgs = await Organization.findAll({ attributes: ['id'] });
    for (const org of orgs) {
      const detected = await detectCandidates(org.id);
      results.detected += detected.length;
    }

    const becameEligible = await refreshEligibility();
    results.becameEligible = becameEligible.length;

    // MED-3: cap batch size to prevent unbounded parallel Claude API calls per scheduler tick
    const autoCandidates = await ReapplyCandidate.findAll({
      where: { status: 'eligible', auto_reapply: true },
      limit: 10
    });

    for (const candidate of autoCandidates) {
      try {
        await executeReapply(candidate.id, candidate.org_id);
        results.autoReapplied += 1;
      } catch (error) {
        logger.error({ candidateId: candidate.id, error: error.message }, 'Auto-reapply failed');
        results.errors.push({ candidateId: candidate.id, error: error.message });
      }
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Scheduled reapply check failed');
    results.errors.push({ error: error.message });
  }

  logger.info(results, 'Scheduled reapply check complete');
  return results;
}

module.exports = {
  estimateNextCycleDate,
  isWithinLeadWindow,
  createCandidateForGrant,
  detectCandidates,
  refreshEligibility,
  buildImprovementContext,
  executeReapply,
  runScheduledReapplyCheck,
  REAPPLY_LEAD_DAYS
};
