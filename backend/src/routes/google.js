const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Organization, Grant } = require('../models');
const google = require('../services/googleService');
const googleSync = require('../services/googleSync');
const { safeError } = require('../utils/safeError');
const logger = require('../utils/logger');
const router = express.Router();

const FRONTEND_URL = () => (process.env.FRONTEND_URL || (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',')[0]).trim();

async function getOrg(req, res) {
  const org = await Organization.findOne({ where: { userId: req.user.userId } });
  if (!org) {
    res.status(404).json({ success: false, error: 'Organization not found. Complete your profile first.' });
    return null;
  }
  return org;
}

async function getConn(org, res) {
  const conn = google.isConfigured() ? await google.getConnection(org.id) : null;
  if (!conn) {
    res.status(409).json({ success: false, error: 'Connect Google first' });
    return null;
  }
  return conn;
}

function errorStatus(error) {
  return error.status || (error.response && error.response.status === 403 ? 403 : 500);
}

function errorMessage(error) {
  // Google's own error text is safe and actionable ("insufficient scopes").
  const g = error.response && error.response.data && error.response.data.error;
  if (g) return typeof g === 'string' ? g : (g.message || 'Google request failed');
  return error.status ? error.message : safeError(error);
}

// GET /api/google/status — is Google set up, and is this org connected
router.get('/status', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const conn = google.isConfigured() ? await google.getConnection(org.id) : null;
    res.json({
      success: true,
      data: {
        server_configured: google.isConfigured(),
        connected: Boolean(conn),
        google_email: conn ? conn.google_email : null,
        scopes: conn ? conn.scopes : [],
        drive_folder_id: conn ? conn.drive_folder_id : null,
        last_error: conn ? conn.last_error : null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// GET /api/google/auth-url — where to send the owner to grant access
router.get('/auth-url', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    if (!google.isConfigured()) {
      return res.status(503).json({ success: false, error: 'Google is not set up on the server yet. See backend/.env.example (GOOGLE_CLIENT_ID).' });
    }
    res.json({ success: true, data: { url: google.buildAuthUrl(org.id), scopes: google.SCOPES } });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// GET /api/google/callback — Google redirects here after consent (no app auth;
// the signed state names the org)
router.get('/callback', async (req, res) => {
  const back = FRONTEND_URL();
  try {
    if (req.query.error) return res.redirect(`${back}/?google=denied`);
    if (!req.query.code || !req.query.state) return res.redirect(`${back}/?google=error`);
    await google.completeOAuth(String(req.query.code), String(req.query.state));
    res.redirect(`${back}/?google=connected`);
  } catch (error) {
    logger.error({ error: error.message }, 'Google OAuth callback failed');
    res.redirect(`${back}/?google=error`);
  }
});

// DELETE /api/google — disconnect and revoke
router.delete('/', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const removed = await google.disconnect(org.id);
    res.json({ success: true, data: { disconnected: removed } });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

async function grantFor(org, id, res) {
  const grant = await Grant.findOne({ where: { id, org_id: org.id } });
  if (!grant) res.status(404).json({ success: false, error: 'Grant not found' });
  return grant;
}

// PUT /api/google/grants/:id/submission — how this funder takes applications
router.put('/grants/:id/submission', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const grant = await grantFor(org, req.params.id, res);
    if (!grant) return;
    const { submission_method, submission_email } = req.body || {};
    if (submission_method !== undefined && !['email', 'portal', 'mail'].includes(submission_method)) {
      return res.status(400).json({ success: false, error: 'submission_method must be email, portal or mail' });
    }
    if (submission_email && !/^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/.test(submission_email)) {
      return res.status(400).json({ success: false, error: 'submission_email is not a valid address' });
    }
    await grant.update({
      ...(submission_method !== undefined ? { submission_method } : {}),
      ...(submission_email !== undefined ? { submission_email: submission_email || null } : {})
    });
    res.json({ success: true, data: { grant, blockers: await googleSync.submissionBlockers(grant) } });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// GET /api/google/grants/:id/readiness — what blocks sending
router.get('/grants/:id/readiness', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const grant = await grantFor(org, req.params.id, res);
    if (!grant) return;
    const blockers = await googleSync.submissionBlockers(grant);
    res.json({ success: true, data: { ready: blockers.length === 0, blockers, google: grant.google || {} } });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST /api/google/grants/:id/gmail-draft — put the submission in Gmail drafts
router.post('/grants/:id/gmail-draft', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const conn = await getConn(org, res);
    if (!conn) return;
    const grant = await grantFor(org, req.params.id, res);
    if (!grant) return;
    const draft = await googleSync.prepareEmailSubmission(conn, org, grant);
    res.json({ success: true, data: { gmail_draft_id: draft.id } });
  } catch (error) {
    res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) });
  }
});

// POST /api/google/grants/:id/send — send the submission now (owner's click)
router.post('/grants/:id/send', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const conn = await getConn(org, res);
    if (!conn) return;
    const grant = await grantFor(org, req.params.id, res);
    if (!grant) return;
    const sent = await googleSync.sendEmailSubmission(conn, org, grant);
    res.json({ success: true, data: { message_id: sent.message_id, grant } });
  } catch (error) {
    res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) });
  }
});

// POST /api/google/grants/:id/drive — save the proposal to Drive
router.post('/grants/:id/drive', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const conn = await getConn(org, res);
    if (!conn) return;
    const grant = await grantFor(org, req.params.id, res);
    if (!grant) return;
    const file = await googleSync.saveGrantToDrive(conn, org, grant);
    if (!file) return res.status(400).json({ success: false, error: 'No proposal draft yet' });
    res.json({ success: true, data: file });
  } catch (error) {
    res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) });
  }
});

// POST /api/google/calendar/sync — push every upcoming date to Google Calendar
router.post('/calendar/sync', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const conn = await getConn(org, res);
    if (!conn) return;
    const { upcomingItems } = require('../services/reminderService');
    const { settingsFor } = require('../services/automationService');
    const items = await upcomingItems(org.id);
    const events = await googleSync.syncCalendar(conn, items, settingsFor(org).reminder_days);
    res.json({ success: true, data: { synced: events.length, created: events.filter(e => e.created).length } });
  } catch (error) {
    res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) });
  }
});

module.exports = router;
