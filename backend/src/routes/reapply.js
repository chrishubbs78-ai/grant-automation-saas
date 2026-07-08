const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Organization, ReapplyCandidate } = require('../models');
const {
  detectCandidates,
  refreshEligibility,
  executeReapply
} = require('../services/reapplyService');
const { safeError } = require('../utils/safeError');
const router = express.Router();

const VALID_STATUSES = ['pending', 'eligible', 'reapplied', 'dismissed'];

// Resolve the caller's org or send a 404
async function getOrg(req, res) {
  const org = await Organization.findOne({ where: { userId: req.user.userId } });
  if (!org) {
    res.status(404).json({ success: false, error: 'Organization not found' });
    return null;
  }
  return org;
}

// GET list reapply candidates (optional ?status= filter)
router.get('/candidates', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;

    const where = { org_id: org.id };
    if (req.query.status) {
      if (!VALID_STATUSES.includes(req.query.status)) {
        return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      where.status = req.query.status;
    }

    const candidates = await ReapplyCandidate.findAll({
      where,
      include: [
        { association: 'originalGrant', attributes: ['id', 'funder_name', 'deadline', 'amount', 'status'] },
        { association: 'newGrant', attributes: ['id', 'funder_name', 'deadline', 'status'] }
      ],
      order: [['next_cycle_date', 'ASC']]
    });

    res.json({ success: true, data: candidates });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST scan rejected grants for new candidates and refresh eligibility
router.post('/scan', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;

    const detected = await detectCandidates(org.id);
    const becameEligible = await refreshEligibility(org.id);

    res.json({
      success: true,
      data: {
        detected: detected.length,
        becameEligible: becameEligible.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST execute a reapply now (manual trigger)
router.post('/candidates/:id/execute', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;

    const result = await executeReapply(req.params.id, org.id);

    res.json({ success: true, data: result });
  } catch (error) {
    const notFound = error.message.includes('not found');
    const conflict = error.message.includes('already') || error.message.includes('dismissed');
    const status = notFound ? 404 : conflict ? 409 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

// POST dismiss a candidate (don't reapply to this one)
router.post('/candidates/:id/dismiss', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;

    const candidate = await ReapplyCandidate.findOne({
      where: { id: req.params.id, org_id: org.id }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, error: 'Reapply candidate not found' });
    }
    if (candidate.status === 'reapplied') {
      return res.status(409).json({ success: false, error: 'Candidate has already been reapplied' });
    }

    await candidate.update({ status: 'dismissed' });

    res.json({ success: true, data: candidate.get({ plain: true }) });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// PATCH update candidate settings (auto_reapply toggle, next_cycle_date override)
router.patch('/candidates/:id', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;

    const candidate = await ReapplyCandidate.findOne({
      where: { id: req.params.id, org_id: org.id }
    });

    if (!candidate) {
      return res.status(404).json({ success: false, error: 'Reapply candidate not found' });
    }

    const updates = {};
    if (typeof req.body.auto_reapply === 'boolean') {
      updates.auto_reapply = req.body.auto_reapply;
    }
    if (req.body.next_cycle_date) {
      const parsed = new Date(req.body.next_cycle_date);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid next_cycle_date' });
      }
      updates.next_cycle_date = parsed;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Nothing to update. Provide auto_reapply and/or next_cycle_date.'
      });
    }

    await candidate.update(updates);

    res.json({ success: true, data: candidate.get({ plain: true }) });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

module.exports = router;
