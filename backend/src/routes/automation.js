const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyToken } = require('../middleware/auth');
const { Organization, AutomationRun } = require('../models');
const { runForOrg, settingsFor, sanitizeSettings, ownerActions } = require('../services/automationService');
const { safeError } = require('../utils/safeError');
const logger = require('../utils/logger');
const router = express.Router();

const runRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6,
  keyGenerator: (req) => req.user?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: 'Automation can run a few times an hour. Please wait before running it again.'
});

async function getOrg(req, res) {
  const org = await Organization.findOne({ where: { userId: req.user.userId } });
  if (!org) {
    res.status(404).json({ success: false, error: 'Organization not found. Complete your profile first.' });
    return null;
  }
  return org;
}

// GET /api/automation — settings, latest runs, and what needs the owner
router.get('/', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const google = require('../services/googleService');
    const conn = google.isConfigured() ? await google.getConnection(org.id) : null;
    const runs = await AutomationRun.findAll({ where: { org_id: org.id }, order: [['started_at', 'DESC']], limit: 10 });
    res.json({
      success: true,
      data: {
        settings: settingsFor(org),
        scheduled_on_server: process.env.AUTOMATION_ENABLED === 'true',
        runs,
        needs_you: await ownerActions(org, conn, settingsFor(org))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// PUT /api/automation/settings — what may happen without asking
router.put('/settings', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const updates = sanitizeSettings(req.body || {});
    await org.update({ automationSettings: { ...(org.automationSettings || {}), ...updates } });
    res.json({ success: true, data: settingsFor(org) });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST /api/automation/run — run a pass now
router.post('/run', verifyToken, runRateLimit, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const run = await runForOrg(org.id, { trigger: 'manual' });
    res.json({ success: true, data: run });
  } catch (error) {
    logger.error({ error: error.message }, 'Manual automation run failed');
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

module.exports = router;
