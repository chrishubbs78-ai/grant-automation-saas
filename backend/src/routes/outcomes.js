const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Organization, Outcome, Grant } = require('../models');
const { computeAnalytics } = require('../services/learningEngine');
const { createCandidateForGrant } = require('../services/reapplyService');
const router = express.Router();

// POST record outcome (grant funded/rejected)
router.post('/:grantId', verifyToken, async (req, res) => {
  try {
    const { grantId } = req.params;
    const { funded, funder_type, amount_bracket, outcome_date, notes } = req.body;

    if (funded === undefined) {
      return res.status(400).json({
        success: false,
        error: 'funded (boolean) required'
      });
    }

    const org = await Organization.findOne({
      where: { userId: req.user.userId }
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    const grant = await Grant.findByPk(grantId);
    if (!grant) {
      return res.status(404).json({
        success: false,
        error: 'Grant not found'
      });
    }

    // Record outcome
    const outcome = await Outcome.create({
      grant_id: grantId,
      org_id: org.id,
      funded,
      funder_type: funder_type || grant.funder_name || 'unknown',
      amount_bracket: amount_bracket || 'unknown',
      outcome_date: outcome_date || new Date(),
      notes: notes || ''
    });

    // Update grant status
    await grant.update({
      status: funded ? 'funded' : 'rejected'
    });

    // Recompute analytics for this org
    const analytics = await computeAnalytics(org.id);

    // On rejection, queue this grant as a reapply candidate for the next cycle.
    // Failure here must not block outcome recording.
    let reapplyCandidate = null;
    if (!funded) {
      try {
        const candidate = await createCandidateForGrant(grant, outcome, org.id);
        reapplyCandidate = candidate.get({ plain: true });
      } catch (reapplyError) {
        console.error('Failed to create reapply candidate:', reapplyError);
      }
    }

    res.json({
      success: true,
      data: {
        outcome: outcome.get({ plain: true }),
        analytics,
        reapplyCandidate
      }
    });
  } catch (error) {
    console.error('Outcome recording error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET outcomes for org
router.get('/', verifyToken, async (req, res) => {
  try {
    const org = await Organization.findOne({
      where: { userId: req.user.userId }
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    const outcomes = await Outcome.findAll({
      where: { org_id: org.id },
      include: [{ association: 'grant', attributes: ['id', 'funder_name', 'amount'] }],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: outcomes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
