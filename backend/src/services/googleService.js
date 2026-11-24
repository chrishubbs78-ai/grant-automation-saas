/**
 * Google integration: Gmail (drafts, sending, reading funder replies),
 * Calendar (deadline events with reminders) and Drive (editable copies of
 * every application).
 *
 * Uses Google's REST APIs directly with OAuth 2.0 tokens. The owner connects
 * their account once; the refresh token is stored encrypted and refreshed as
 * needed. Scopes are the narrowest that do the job:
 *   gmail.compose  — create drafts and send them
 *   gmail.readonly — read funder replies for the inbox scan
 *   calendar.events — add and update deadline events
 *   drive.file     — only files this app creates, never the rest of Drive
 */
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { GoogleConnection } = require('../models');
const { encrypt, decrypt } = require('../utils/tokenCrypto');
const logger = require('../utils/logger');

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.file'
];

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CALENDAR = 'https://www.googleapis.com/calendar/v3';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_FOLDER_NAME = process.env.GOOGLE_DRIVE_FOLDER_NAME || 'Grant & Loan Applications';

function oauthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

function isConfigured() {
  return oauthConfig() !== null;
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

/** The consent URL. `state` is a short-lived signed token naming the org. */
function buildAuthUrl(orgId) {
  const cfg = oauthConfig();
  if (!cfg) throw new Error('Google is not set up on the server. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI.');
  const state = jwt.sign({ orgId, purpose: 'google_oauth' }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    // Always ask, so Google returns a refresh token even on a reconnect.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state
  });
  return `${AUTH_URL}?${params.toString()}`;
}

function verifyState(state) {
  const payload = jwt.verify(state, process.env.JWT_SECRET);
  if (payload.purpose !== 'google_oauth' || !payload.orgId) throw new Error('Invalid OAuth state');
  return payload.orgId;
}

function emailFromIdToken(idToken) {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
    return payload.email || null;
  } catch {
    return null;
  }
}

/** Exchange the code from Google's redirect and store the connection. */
async function completeOAuth(code, state) {
  const cfg = oauthConfig();
  if (!cfg) throw new Error('Google is not set up on the server');
  const orgId = verifyState(state);

  const { data } = await axios.post(TOKEN_URL, new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: 'authorization_code'
  }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

  const existing = await GoogleConnection.findOne({ where: { org_id: orgId } });
  const refresh = data.refresh_token || (existing && decrypt(existing.refresh_token_enc));
  if (!refresh) throw new Error('Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.');

  const fields = {
    org_id: orgId,
    google_email: emailFromIdToken(data.id_token) || (existing && existing.google_email) || null,
    scopes: (data.scope || '').split(' ').filter(Boolean),
    refresh_token_enc: encrypt(refresh),
    access_token_enc: encrypt(data.access_token),
    access_token_expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    last_error: null
  };

  if (existing) {
    await existing.update(fields);
    return existing;
  }
  return GoogleConnection.create(fields);
}

async function getConnection(orgId) {
  return GoogleConnection.findOne({ where: { org_id: orgId } });
}

/** A valid access token, refreshing it when it is within a minute of expiry. */
async function accessToken(conn) {
  const expires = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0;
  if (conn.access_token_enc && expires - Date.now() > 60000) {
    return decrypt(conn.access_token_enc);
  }
  const cfg = oauthConfig();
  if (!cfg) throw new Error('Google is not set up on the server');
  try {
    const { data } = await axios.post(TOKEN_URL, new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: decrypt(conn.refresh_token_enc),
      grant_type: 'refresh_token'
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    await conn.update({
      access_token_enc: encrypt(data.access_token),
      access_token_expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      last_error: null
    });
    return data.access_token;
  } catch (error) {
    const reason = error.response?.data?.error || error.message;
    await conn.update({ last_error: `Token refresh failed: ${reason}` });
    throw new Error(reason === 'invalid_grant'
      ? 'Google access was revoked or expired. Reconnect Google in Settings.'
      : `Could not refresh Google access: ${reason}`);
  }
}

async function api(conn, method, url, { data, params, headers } = {}) {
  const token = await accessToken(conn);
  const res = await axios({ method, url, data, params, headers: { Authorization: `Bearer ${token}`, ...(headers || {}) } });
  return res.data;
}

async function disconnect(orgId) {
  const conn = await getConnection(orgId);
  if (!conn) return false;
  try {
    await axios.post(REVOKE_URL, new URLSearchParams({ token: decrypt(conn.refresh_token_enc) }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  } catch (error) {
    // Revocation is best effort; the stored tokens are deleted either way.
    logger.warn({ error: error.message }, 'Google token revoke failed');
  }
  await conn.destroy();
  return true;
}

// ─── Gmail ────────────────────────────────────────────────────────────────────

function encodeHeader(value) {
  // RFC 2047 for anything outside plain ASCII (names, em dashes in subjects).
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function assertAddress(value, field) {
  if (!value) return;
  const parts = String(value).split(',').map(s => s.trim()).filter(Boolean);
  for (const p of parts) {
    const addr = p.includes('<') ? p.slice(p.indexOf('<') + 1, p.indexOf('>')) : p;
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(addr) || /[\r\n]/.test(p)) {
      throw new Error(`Invalid email address in ${field}: ${p}`);
    }
  }
}

/**
 * Build an RFC 822 message, base64url-encoded for the Gmail API.
 * attachments: [{ filename, mimeType, content: Buffer }]
 */
function buildRawMessage({ to, cc, subject, text, attachments = [] }) {
  assertAddress(to, 'to');
  assertAddress(cc, 'cc');
  const safeSubject = String(subject || '').replace(/[\r\n]+/g, ' ');
  const headers = [
    `To: ${to || ''}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${encodeHeader(safeSubject)}`,
    'MIME-Version: 1.0'
  ];
  const body = Buffer.from(text || '', 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');

  let message;
  if (attachments.length === 0) {
    message = [...headers, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', body].join('\r\n');
  } else {
    const boundary = `grantapp_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const parts = [
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      body
    ];
    for (const a of attachments) {
      const name = String(a.filename).replace(/["\r\n]/g, '');
      parts.push(
        `--${boundary}`,
        `Content-Type: ${a.mimeType || 'application/octet-stream'}; name="${name}"`,
        `Content-Disposition: attachment; filename="${name}"`,
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(a.content).toString('base64').replace(/.{76}/g, '$&\r\n')
      );
    }
    parts.push(`--${boundary}--`);
    message = [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', ...parts].join('\r\n');
  }
  return Buffer.from(message, 'utf8').toString('base64url');
}

/** Create (or replace) a Gmail draft. Returns { id, message_id }. */
async function createDraft(conn, message, existingDraftId = null) {
  const raw = buildRawMessage(message);
  const data = existingDraftId
    ? await api(conn, 'put', `${GMAIL}/drafts/${existingDraftId}`, { data: { id: existingDraftId, message: { raw } } })
    : await api(conn, 'post', `${GMAIL}/drafts`, { data: { message: { raw } } });
  return { id: data.id, message_id: data.message && data.message.id };
}

/** Send an existing draft. Returns the sent message id. */
async function sendDraft(conn, draftId) {
  const data = await api(conn, 'post', `${GMAIL}/drafts/send`, { data: { id: draftId } });
  return { message_id: data.id, thread_id: data.threadId };
}

function headerValue(headers, name) {
  const h = (headers || []).find(x => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function parseFrom(value) {
  const m = /^(.*?)\s*<([^>]+)>$/.exec(value || '');
  return m ? { name: m[1].replace(/"/g, '').trim(), address: m[2] } : { name: '', address: value || '' };
}

/**
 * Recent inbox messages in the same shape the IMAP scanner produces, so the
 * inbox scan can use Gmail instead of an app password.
 */
async function listRecentMessages(conn, { days = 7, max = 100, snippetChars = 1500 } = {}) {
  const list = await api(conn, 'get', `${GMAIL}/messages`, {
    params: { q: `in:inbox newer_than:${Math.max(1, days)}d`, maxResults: Math.min(max, 500) }
  });
  const out = [];
  for (const { id } of list.messages || []) {
    const msg = await api(conn, 'get', `${GMAIL}/messages/${id}`, {
      params: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] }
    });
    const from = parseFrom(headerValue(msg.payload && msg.payload.headers, 'From'));
    out.push({
      message_uid: `gmail:${id}`,
      subject: headerValue(msg.payload && msg.payload.headers, 'Subject'),
      from_address: from.address,
      from_name: from.name,
      received_at: msg.internalDate ? new Date(parseInt(msg.internalDate, 10)) : null,
      snippet: (msg.snippet || '').slice(0, snippetChars)
    });
  }
  return out;
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

function ymd(date) {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

/**
 * Create or update an all-day event with popup and email reminders.
 * `key` is stored as a private property so reruns update instead of duplicate.
 */
async function upsertDeadlineEvent(conn, { key, summary, description, date, reminderDays = [14, 7, 2] }) {
  const calendarId = encodeURIComponent(conn.calendar_id || 'primary');
  const start = ymd(date);
  const end = ymd(new Date(new Date(date).getTime() + 86400000));
  const minutes = reminderDays.map(d => Math.min(d * 1440, 40320)); // Google caps at 4 weeks
  const event = {
    summary,
    description,
    start: { date: start },
    end: { date: end },
    reminders: {
      useDefault: false,
      overrides: [
        ...minutes.slice(0, 3).map(m => ({ method: 'email', minutes: m })),
        { method: 'popup', minutes: Math.min(...minutes, 1440) }
      ].slice(0, 5)
    },
    extendedProperties: { private: { grantAppKey: key } }
  };

  const found = await api(conn, 'get', `${CALENDAR}/calendars/${calendarId}/events`, {
    params: { privateExtendedProperty: `grantAppKey=${key}`, maxResults: 1 }
  });
  const existing = (found.items || [])[0];
  if (existing) {
    const updated = await api(conn, 'put', `${CALENDAR}/calendars/${calendarId}/events/${existing.id}`, { data: event });
    return { id: updated.id, html_link: updated.htmlLink, created: false };
  }
  const created = await api(conn, 'post', `${CALENDAR}/calendars/${calendarId}/events`, { data: event });
  return { id: created.id, html_link: created.htmlLink, created: true };
}

// ─── Drive ────────────────────────────────────────────────────────────────────

async function ensureFolder(conn) {
  if (conn.drive_folder_id) return conn.drive_folder_id;
  const folder = await api(conn, 'post', `${DRIVE}/files`, {
    data: { name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
    params: { fields: 'id' }
  });
  await conn.update({ drive_folder_id: folder.id });
  return folder.id;
}

/**
 * Upload a .docx as an editable Google Doc (or update the one made before).
 * Returns { id, link }.
 */
async function saveDocToDrive(conn, { name, buffer, existingFileId = null }) {
  const folderId = await ensureFolder(conn);
  const boundary = `drive_${Date.now().toString(36)}`;
  const metadata = existingFileId
    ? { name }
    : { name, parents: [folderId], mimeType: 'application/vnd.google-apps.document' };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  const url = existingFileId ? `${DRIVE_UPLOAD}/files/${existingFileId}` : `${DRIVE_UPLOAD}/files`;
  const data = await api(conn, existingFileId ? 'patch' : 'post', url, {
    data: body,
    params: { uploadType: 'multipart', fields: 'id,webViewLink' },
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }
  });
  return { id: data.id, link: data.webViewLink };
}

module.exports = {
  SCOPES,
  isConfigured,
  buildAuthUrl,
  verifyState,
  completeOAuth,
  getConnection,
  disconnect,
  buildRawMessage,
  createDraft,
  sendDraft,
  listRecentMessages,
  upsertDeadlineEvent,
  saveDocToDrive,
  ensureFolder
};
