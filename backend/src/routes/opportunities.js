const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Organization, GrantOpportunity, OpportunityMatch, Grant, RFPAnalysis } = require('../models');
const { runDiscovery } = require('../services/matchingEngine');
const { safeError } = require('../utils/safeError');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const router = express.Router();

// Discovery hits an external API and spends Claude tokens — same per-user cap
// as the other AI-backed endpoints.
const discoveryRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  // The suite runs many discovery calls back-to-back; without this the limiter
  // silently empties the feed and later tests fail on unrelated assertions.
  skip: () => process.env.NODE_ENV === 'test',
  message: 'Too many discovery runs. Please wait before trying again.'
});

const VALID_STATUSES = ['new', 'reviewed', 'dismissed', 'converted'];

async function getOrg(req, res) {
  const org = await Organization.findOne({ where: { userId: req.user.userId } });
  if (!org) {
    res.status(404).json({ success: false, error: 'Organization not found. Complete your profile first.' });
    return null;
  }
  return org;
}

// POST /api/opportunities/discover — search sources, prefilter, score
router.post('/discover', verifyToken, discoveryRateLimit, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;

    const { keywords, max_scored } = req.body || {};
    if (keywords !== undefined && !Array.isArray(keywords)) {
      return res.status(400).json({ success: false, error: 'keywords must be an array of strings' });
    }

    const options = { keywords: keywords || null };
    if (Number.isInteger(max_scored)) {
      options.maxScored = Math.max(1, Math.min(max_scored, 30));
    }

    const result = await runDiscovery(org.id, options);

    res.json({
      success: true,
      data: {
        discovered: result.discovered,
        new_opportunities: result.new,
        filtered_out: result.prefiltered,
        scored: result.scored,
        source_unreachable: result.source_unreachable,
        source_errors: result.source_errors
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Discovery run failed');
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// GET /api/opportunities — ranked matches for the caller's org
router.get('/', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;

    const where = { org_id: org.id };

    if (req.query.status) {
      if (!VALID_STATUSES.includes(req.query.status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`
        });
      }
      where.status = req.query.status;
    } else {
      // Default view hides the prefilter rejects — they're retrievable via
      // ?status=dismissed but shouldn't bury the actionable list.
      where.status = ['new', 'reviewed'];
    }

    const matches = await OpportunityMatch.findAll({
      where,
      include: [{ association: 'opportunity' }],
      order: [['fit_score', 'DESC NULLS LAST'], ['created_at', 'DESC']],
      limit: Math.min(parseInt(req.query.limit, 10) || 50, 200)
    });

    const minScore = parseInt(req.query.min_score, 10);
    const data = Number.isInteger(minScore)
      ? matches.filter(m => (m.fit_score || 0) >= minScore)
      : matches;

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// PATCH /api/opportunities/:id — mark reviewed / dismiss
router.patch('/:id', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;

    const match = await OpportunityMatch.findOne({
      where: { id: req.params.id, org_id: org.id }
    });
    if (!match) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }
    if (match.status === 'converted') {
      return res.status(409).json({ success: false, error: 'This match has already become an application' });
    }

    const updates = {};
    if (req.body.status) {
      if (!['new', 'reviewed', 'dismissed'].includes(req.body.status)) {
        return res.status(400).json({ success: false, error: 'status must be new, reviewed, or dismissed' });
      }
      updates.status = req.body.status;
    }
    if (typeof req.body.dismissed_reason === 'string') {
      updates.dismissed_reason = req.body.dismissed_reason.substring(0, 1000);
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'Nothing to update. Provide status and/or dismissed_reason.' });
    }

    await match.update(updates);
    res.json({ success: true, data: match });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST /api/opportunities/:id/convert — the manual approval gate.
// Turns a matched opportunity into a real application AND seeds the RFP
// analysis, so the user can generate a draft immediately without re-pasting
// the opportunity text.
router.post('/:id/convert', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;

    const match = await OpportunityMatch.findOne({
      where: { id: req.params.id, org_id: org.id },
      include: [{ association: 'opportunity' }]
    });
    if (!match) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }
    if (match.status === 'converted' && match.grant_id) {
      return res.status(409).json({
        success: false,
        error: 'Already converted',
        data: { grant_id: match.grant_id }
      });
    }

    const opp = match.opportunity;

    const grant = await Grant.create({
      org_id: org.id,
      opportunity_id: opp.id,
      funder_name: opp.agency || opp.title,
      deadline: opp.close_date,
      amount: opp.award_ceiling || null,
      status: 'draft',
      rfp_analysis: {
        funder_name: opp.agency,
        deadline: opp.close_date,
        award_range: { min: opp.award_floor, max: opp.award_ceiling },
        eligibility: { who_can_apply: opp.eligibility_text || 'See opportunity listing' },
        source_url: opp.source_url
      },
      // Keep the trail back to the listing on the grant itself. Once this
      // becomes an application you are working for weeks, "where did this come
      // from" is a question you will ask again.
      notes: `Discovered via ${opp.source} (${opp.opportunity_number || opp.source_id}).`
        + (match.fit_score !== null ? ` Match score ${match.fit_score}/100.` : '')
        + (opp.source_url ? `\nListing: ${opp.source_url}` : '')
    });

    // Seed the RFP analysis so /api/drafts/generate works on this grant with no
    // further input — this is what makes discovery → draft a single click.
    const analysis = await RFPAnalysis.create({
      grant_id: grant.id,
      org_id: org.id,
      raw_text: (opp.description || opp.title || '').substring(0, 5000),
      funder_name: opp.agency || 'Unknown',
      deadline: opp.close_date,
      requirements: [],
      evaluation_criteria: {},
      research_summary: {
        source: opp.source,
        source_url: opp.source_url,
        opportunity_number: opp.opportunity_number,
        match_rationale: match.rationale,
        key_alignment: match.key_alignment,
        concerns: match.concerns
      }
    });

    await match.update({ status: 'converted', grant_id: grant.id });

    res.status(201).json({
      success: true,
      data: {
        grant: grant.get({ plain: true }),
        rfp_analysis_id: analysis.id,
        match: match.get({ plain: true })
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to convert opportunity to application');
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

module.exports = router;
