const express = require('express');
const { Op } = require('sequelize');
const { verifyToken } = require('../middleware/auth');
const {
  Organization, Grant, OpportunityMatch, ReapplyCandidate, ApplicationDocument
} = require('../models');
const { safeError } = require('../utils/safeError');
const router = express.Router();

/**
 * The application pipeline, bucketed into the four stages that actually matter
 * when you are running grants:
 *
 *   found     — opportunities you have not decided on, plus drafts not yet sent
 *   filed     — sent to the funder, waiting on an answer
 *   past      — the deadline went by, or a decision came back. History.
 *   reopened  — rejected grants whose next cycle is open again
 *
 * Bucketing lives here rather than in the client so every surface — dashboard,
 * scheduler, any future export — agrees on what "filed" means.
 */

const OPEN_STATUSES = ['submitted', 'pending'];
const DECIDED_STATUSES = ['funded', 'rejected'];

async function getOrg(req, res) {
  const org = await Organization.findOne({ where: { userId: req.user.userId } });
  if (!org) {
    res.status(404).json({ success: false, error: 'Organization not found' });
    return null;
  }
  return org;
}

/** Attach document-readiness so the UI can flag incomplete applications. */
async function withDocumentProgress(grants) {
  if (grants.length === 0) return [];

  const ids = grants.map(g => g.id);
  const docs = await ApplicationDocument.findAll({ where: { grant_id: ids } });

  const byGrant = new Map();
  for (const doc of docs) {
    if (!byGrant.has(doc.grant_id)) byGrant.set(doc.grant_id, []);
    byGrant.get(doc.grant_id).push(doc);
  }

  return grants.map(g => {
    const list = byGrant.get(g.id) || [];
    const required = list.filter(d => d.required && d.status !== 'not_applicable');
    const done = required.filter(d => d.status === 'attached');
    return {
      ...g.get({ plain: true }),
      documents: {
        required: required.length,
        attached: done.length,
        complete: required.length > 0 && done.length === required.length,
        missing: required.filter(d => d.status !== 'attached').map(d => d.label)
      }
    };
  });
}

// GET /api/pipeline — everything, bucketed
router.get('/', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;

    const now = new Date();

    // FOUND — opportunities awaiting your call, plus applications started but
    // not yet sent and still inside their deadline.
    const opportunities = await OpportunityMatch.findAll({
      where: { org_id: org.id, status: ['new', 'reviewed'] },
      include: [{ association: 'opportunity' }],
      order: [['fit_score', 'DESC NULLS LAST']],
      limit: 100
    });

    const drafts = await Grant.findAll({
      where: {
        org_id: org.id,
        status: 'draft',
        [Op.or]: [{ deadline: null }, { deadline: { [Op.gte]: now } }]
      },
      order: [['deadline', 'ASC NULLS LAST']]
    });

    // FILED — with the funder, no answer yet.
    const filed = await Grant.findAll({
      where: { org_id: org.id, status: OPEN_STATUSES },
      order: [['submitted_at', 'DESC NULLS LAST'], ['deadline', 'ASC NULLS LAST']]
    });

    // PAST — deadline elapsed without filing (a miss worth seeing), or decided.
    const missed = await Grant.findAll({
      where: {
        org_id: org.id,
        status: 'draft',
        deadline: { [Op.lt]: now }
      },
      order: [['deadline', 'DESC']]
    });

    const decided = await Grant.findAll({
      where: { org_id: org.id, status: DECIDED_STATUSES },
      include: [{ association: 'outcome' }],
      order: [['outcome_recorded_at', 'DESC NULLS LAST'], ['updated_at', 'DESC']],
      limit: 100
    });

    // REOPENED — rejected grants whose next cycle has come around.
    const reopened = await ReapplyCandidate.findAll({
      where: { org_id: org.id, status: ['pending', 'eligible'] },
      include: [
        { association: 'originalGrant', attributes: ['id', 'funder_name', 'deadline', 'amount', 'status'] }
      ],
      order: [['next_cycle_date', 'ASC NULLS LAST']]
    });

    const [draftsWithDocs, filedWithDocs, missedWithDocs] = await Promise.all([
      withDocumentProgress(drafts),
      withDocumentProgress(filed),
      withDocumentProgress(missed)
    ]);

    res.json({
      success: true,
      data: {
        found: {
          opportunities,
          drafts: draftsWithDocs,
          count: opportunities.length + draftsWithDocs.length
        },
        filed: {
          grants: filedWithDocs,
          count: filedWithDocs.length,
          // Filed applications with unfinished paperwork are the ones to chase.
          incomplete: filedWithDocs.filter(g => g.documents.required > 0 && !g.documents.complete).length
        },
        past: {
          missed: missedWithDocs,
          decided: decided.map(g => g.get({ plain: true })),
          count: missedWithDocs.length + decided.length
        },
        reopened: {
          candidates: reopened,
          count: reopened.length,
          eligible: reopened.filter(c => c.status === 'eligible').length
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

module.exports = router;
