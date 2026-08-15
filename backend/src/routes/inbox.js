const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Organization, Grant, EmailFinding, Outcome } = require('../models');
const { scanForOrg, isConfigured } = require('../services/emailScanService');
const { safeError } = require('../utils/safeError');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const router = express.Router();

const scanRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 12,
  keyGenerator: (req) => req.user?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: 'Too many inbox scans. Please wait before trying again.'
});

async function getOrg(req, res) {
  const org = await Organization.findOne({ where: { userId: req.user.userId } });
  if (!org) {
    res.status(404).json({ success: false, error: 'Organization not found' });
    return null;
  }
  return org;
}

// GET /api/inbox/status — is scanning configured at all?
router.get('/status', verifyToken, async (req, res) => {
  res.json({
    success: true,
    data: {
      configured: isConfigured(),
      // Tell the user exactly what to set rather than just "not configured".
      required_env: isConfigured() ? [] : [
        'EMAIL_SCAN_ENABLED=true',
        'EMAIL_IMAP_HOST',
        'EMAIL_IMAP_USER',
        'EMAIL_IMAP_PASSWORD'
      ]
    }
  });
});

// POST /api/inbox/scan — scan now
router.post('/scan', verifyToken, scanRateLimit, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;

    if (!isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'Inbox scanning is not configured. Set EMAIL_SCAN_ENABLED, EMAIL_IMAP_HOST, '
          + 'EMAIL_IMAP_USER, and EMAIL_IMAP_PASSWORD in backend/.env, then restart.'
      });
    }

    const result = await scanForOrg(org.id);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error: error.message }, 'Inbox scan failed');
    res.status(502).json({ success: false, error: safeError(error) });
  }
});

// GET /api/inbox/findings — what the scan noticed, awaiting your call
router.get('/findings', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;

    const status = req.query.status || 'pending';
    if (!['pending', 'accepted', 'dismissed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'status must be pending, accepted, or dismissed' });
    }

    const findings = await EmailFinding.findAll({
      where: { org_id: org.id, status },
      include: [{ association: 'grant', attributes: ['id', 'funder_name', 'status', 'deadline'] }],
      order: [['received_at', 'DESC NULLS LAST'], ['created_at', 'DESC']],
      limit: 100
    });

    res.json({ success: true, data: findings });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST /api/inbox/findings/:id/accept — apply the proposed status change
router.post('/findings/:id/accept', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;

    const finding = await EmailFinding.findOne({
      where: { id: req.params.id, org_id: org.id }
    });
    if (!finding) return res.status(404).json({ success: false, error: 'Finding not found' });
    if (finding.status !== 'pending') {
      return res.status(409).json({ success: false, error: 'This finding has already been resolved' });
    }

    // The status applied is whatever the human confirms, defaulting to the
    // proposal. The email is evidence; the person is the decision.
    const newStatus = req.body?.status || finding.proposed_status;
    if (!newStatus) {
      return res.status(400).json({
        success: false,
        error: 'This finding proposes no status change. Provide a status explicitly to apply one.'
      });
    }
    if (!['submitted', 'pending', 'funded', 'rejected'].includes(newStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    if (!finding.grant_id) {
      return res.status(400).json({ success: false, error: 'This finding is not linked to an application' });
    }

    const grant = await Grant.findOne({ where: { id: finding.grant_id, org_id: org.id } });
    if (!grant) return res.status(404).json({ success: false, error: 'Application not found' });

    await grant.update({
      status: newStatus,
      outcome_recorded_at: ['funded', 'rejected'].includes(newStatus) ? new Date() : grant.outcome_recorded_at
    });

    // A decision needs an Outcome row, since that is what the learning engine
    // and the reapply queue read from.
    if (['funded', 'rejected'].includes(newStatus)) {
      const existing = await Outcome.findOne({ where: { grant_id: grant.id } });
      if (!existing) {
        await Outcome.create({
          grant_id: grant.id,
          org_id: org.id,
          funded: newStatus === 'funded',
          outcome_date: finding.received_at || new Date(),
          notes: `Recorded from funder email: "${(finding.subject || '').substring(0, 200)}"`
        });
      }
    }

    await finding.update({ status: 'accepted', resolved_at: new Date() });

    res.json({ success: true, data: { finding, grant_status: newStatus } });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to accept inbox finding');
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST /api/inbox/findings/:id/dismiss
router.post('/findings/:id/dismiss', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;

    const finding = await EmailFinding.findOne({
      where: { id: req.params.id, org_id: org.id }
    });
    if (!finding) return res.status(404).json({ success: false, error: 'Finding not found' });
    if (finding.status !== 'pending') {
      return res.status(409).json({ success: false, error: 'This finding has already been resolved' });
    }

    await finding.update({ status: 'dismissed', resolved_at: new Date() });
    res.json({ success: true, data: finding });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

module.exports = router;
