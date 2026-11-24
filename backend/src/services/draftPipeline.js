/**
 * One place that turns an RFP analysis into a stored proposal draft, used by
 * the draft route and by the automation runner so both write the same way.
 *
 *   1. Work out who applies (business, or youth program via fiscal sponsor).
 *   2. Re-angle the business plan for this funder (best effort).
 *   3. Write the proposal and store it as a new Draft version.
 */
const { Grant, Draft, Analytics } = require('../models');
const { generateDraft, tailorPlanForFunder } = require('./claudeService');
const logger = require('../utils/logger');

function hasPlan(org) {
  const plan = org.businessPlan || {};
  return Object.values(plan).some(v => typeof v === 'string' && v.trim());
}

async function generateAndStoreDraft({ org, rfp }) {
  const orgPlain = typeof org.get === 'function' ? org.get({ plain: true }) : org;
  const rfpPlain = typeof rfp.get === 'function' ? rfp.get({ plain: true }) : rfp;

  const grant = rfpPlain.grant_id ? await Grant.findByPk(rfpPlain.grant_id) : null;
  const lane = (grant && grant.applicant_lane) || 'organization';

  let tailoring = null;
  if (hasPlan(orgPlain)) {
    try {
      tailoring = await tailorPlanForFunder({ orgProfile: orgPlain, rfpAnalysis: rfpPlain, lane });
    } catch (error) {
      // A tailoring failure should never block the draft itself.
      logger.warn({ error: error.message, grantId: rfpPlain.grant_id }, 'Funder tailoring failed; drafting without it');
    }
  }

  const analytics = await Analytics.findOne({ where: { org_id: orgPlain.id } });
  const draft = await generateDraft({
    orgProfile: orgPlain,
    rfpAnalysis: rfpPlain,
    analytics: analytics ? analytics.get({ plain: true }) : null,
    lane,
    tailoring
  });

  const previous = rfpPlain.grant_id
    ? await Draft.max('version', { where: { grant_id: rfpPlain.grant_id } })
    : null;

  const record = await Draft.create({
    grant_id: rfpPlain.grant_id,
    org_id: orgPlain.id,
    version: (previous || 0) + 1,
    problem_statement: draft.statement_of_need || draft.problem_statement || '',
    impact_statement: draft.goals_and_objectives || draft.impact_statement || '',
    budget_narrative: draft.budget_narrative || '',
    executive_summary: draft.executive_summary || '',
    organization_background: draft.organization_background || '',
    statement_of_need: draft.statement_of_need || '',
    goals_and_objectives: draft.goals_and_objectives || '',
    program_design: draft.program_design || '',
    evaluation_plan: draft.evaluation_plan || '',
    sustainability_plan: draft.sustainability_plan || ''
  });

  if (grant) {
    await grant.update({
      draft_sections: { ...draft, ...(tailoring ? { funder_angle: tailoring.angle, missing_for_this_funder: tailoring.missing_for_this_funder } : {}) }
    });
  }

  return { draft: record, lane, tailoring };
}

module.exports = { generateAndStoreDraft };
