const express = require('express');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/auth');
const { Organization } = require('../models');
const { upcomingItems, buildIcs } = require('../services/reminderService');
const { settingsFor } = require('../services/automationService');
const { safeError } = require('../utils/safeError');
const router = express.Router();

async function getOrg(req, res) {
  const org = await Organization.findOne({ where: { userId: req.user.userId } });
  if (!org) {
    res.status(404).json({ success: false, error: 'Organization not found. Complete your profile first.' });
    return null;
  }
  return org;
}

// GET /api/calendar/upcoming — every dated item, soonest first
router.get('/upcoming', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const days = Math.max(7, Math.min(parseInt(req.query.days || '180', 10) || 180, 730));
    res.json({ success: true, data: await upcomingItems(org.id, { horizonDays: days }) });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// GET /api/calendar/export.ics — one-time download for any calendar app
router.get('/export.ics', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const ics = buildIcs(await upcomingItems(org.id, { horizonDays: 365 }), { reminderDays: settingsFor(org).reminder_days });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="grant-deadlines.ics"');
    res.send(ics);
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// GET /api/calendar/feed-url — a private subscription link (works without Google)
router.get('/feed-url', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const token = jwt.sign({ orgId: org.id, purpose: 'calendar_feed' }, process.env.JWT_SECRET);
    const base = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ success: true, data: { url: `${base}/api/calendar/feed/${token}.ics` } });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// GET /api/calendar/feed/:token.ics — calendar apps poll this; the token is the auth
router.get('/feed/:token.ics', async (req, res) => {
  try {
    let payload;
    try {
      payload = jwt.verify(req.params.token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).send('Invalid calendar link');
    }
    if (payload.purpose !== 'calendar_feed') return res.status(401).send('Invalid calendar link');
    const org = await Organization.findByPk(payload.orgId);
    if (!org) return res.status(404).send('Not found');
    const ics = buildIcs(await upcomingItems(org.id, { horizonDays: 365 }), { reminderDays: settingsFor(org).reminder_days });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(ics);
  } catch (error) {
    res.status(500).send('Calendar unavailable');
  }
});

module.exports = router;
