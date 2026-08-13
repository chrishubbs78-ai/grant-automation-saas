/**
 * Daily inbox scan for funder responses.
 *
 * Three deliberate constraints:
 *
 *  1. READ-ONLY. The connection never deletes, moves, or marks anything. It
 *     opens mailboxes with {readOnly: true} so a bug cannot touch your mail.
 *  2. NARROW. Only messages whose sender or subject matches a funder you are
 *     actually tracking get looked at. Everything else is skipped without ever
 *     being read, let alone sent anywhere.
 *  3. PROPOSES, NEVER DECIDES. A finding suggests a status change for you to
 *     confirm. Classifying "we regret to inform you" right most of the time is
 *     not good enough when being wrong silently marks a live application dead.
 *
 * Off unless EMAIL_SCAN_ENABLED=true and credentials are set.
 */

const { Grant, EmailFinding } = require('../models');
const { classifyFunderEmails } = require('./claudeService');
const logger = require('../utils/logger');

const ENABLED = process.env.EMAIL_SCAN_ENABLED === 'true';
const LOOKBACK_DAYS = parseInt(process.env.EMAIL_SCAN_LOOKBACK_DAYS || '7', 10);
const MAX_CLASSIFY = parseInt(process.env.EMAIL_SCAN_MAX_CLASSIFY || '25', 10);
const SNIPPET_CHARS = 1500;

function imapConfig() {
  const host = process.env.EMAIL_IMAP_HOST;
  const user = process.env.EMAIL_IMAP_USER;
  const pass = process.env.EMAIL_IMAP_PASSWORD;
  if (!host || !user || !pass) return null;

  return {
    host,
    port: parseInt(process.env.EMAIL_IMAP_PORT || '993', 10),
    secure: process.env.EMAIL_IMAP_SECURE !== 'false',
    auth: { user, pass },
    logger: false
  };
}

function isConfigured() {
  return ENABLED && imapConfig() !== null;
}

/**
 * Distinctive tokens from a funder name. "Department of Education" should not
 * match on "of"; "Eccles" should match on "Eccles".
 */
const NAME_STOP = new Set([
  'the', 'of', 'and', 'for', 'inc', 'llc', 'foundation', 'department',
  'office', 'division', 'agency', 'fund', 'trust', 'program', 'grants', 'grant'
]);

function funderTokens(name) {
  return (name || '')
    .toLowerCase()
    .match(/[a-z]{4,}/g)
    ?.filter(w => !NAME_STOP.has(w)) || [];
}

/**
 * Free prefilter: does this message plausibly concern a tracked application?
 * Returns the matching grant, or null. Runs on headers only.
 */
function matchToGrant(message, grants) {
  const haystack = `${message.subject || ''} ${message.from_address || ''}`.toLowerCase();

  for (const grant of grants) {
    const tokens = funderTokens(grant.funder_name);
    if (tokens.length && tokens.some(t => haystack.includes(t))) return grant;

    // Funders often reply from a domain resembling their name.
    const domain = (message.from_address || '').split('@')[1] || '';
    if (tokens.some(t => domain.includes(t))) return grant;
  }
  return null;
}

/** Pull recent message headers + a short body excerpt. Read-only throughout. */
async function fetchRecentMessages() {
  const config = imapConfig();
  if (!config) return [];

  // Required lazily so the dependency is only loaded when the feature is on.
  const { ImapFlow } = require('imapflow');
  const client = new ImapFlow(config);
  const messages = [];

  await client.connect();
  try {
    const mailbox = process.env.EMAIL_IMAP_MAILBOX || 'INBOX';
    const lock = await client.getMailboxLock(mailbox, { readOnly: true });
    try {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000);
      for await (const msg of client.fetch({ since }, { envelope: true, bodyParts: ['TEXT'], uid: true })) {
        const from = msg.envelope?.from?.[0];
        let snippet = '';
        const part = msg.bodyParts?.get('text');
        if (part) snippet = part.toString('utf8').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_CHARS);

        messages.push({
          message_uid: `${mailbox}:${msg.uid}`,
          subject: msg.envelope?.subject || '',
          from_address: from ? `${from.address}` : '',
          from_name: from?.name || '',
          received_at: msg.envelope?.date || null,
          snippet
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }

  return messages;
}

/**
 * Run one scan for an organization.
 * @returns {Promise<{scanned:number,matched:number,classified:number,created:number,skipped:string|null}>}
 */
async function scanForOrg(orgId) {
  if (!isConfigured()) {
    return { scanned: 0, matched: 0, classified: 0, created: 0, skipped: 'not_configured' };
  }

  // Only applications actually awaiting an answer are worth watching.
  const grants = await Grant.findAll({
    where: { org_id: orgId, status: ['submitted', 'pending'] },
    attributes: ['id', 'funder_name', 'status', 'deadline']
  });
  if (grants.length === 0) {
    return { scanned: 0, matched: 0, classified: 0, created: 0, skipped: 'no_open_applications' };
  }

  let messages;
  try {
    messages = await fetchRecentMessages();
  } catch (error) {
    logger.error({ error: error.message }, 'Inbox scan could not connect');
    throw new Error(`Could not reach the mail server: ${error.message}`);
  }

  // Skip anything already turned into a finding — a message is processed once.
  const seen = await EmailFinding.findAll({
    where: { org_id: orgId },
    attributes: ['message_uid']
  });
  const seenUids = new Set(seen.map(f => f.message_uid));

  const candidates = [];
  for (const msg of messages) {
    if (seenUids.has(msg.message_uid)) continue;
    const grant = matchToGrant(msg, grants);
    if (grant) candidates.push({ msg, grant });
  }

  const toClassify = candidates.slice(0, MAX_CLASSIFY);
  let classifications = [];
  if (toClassify.length > 0) {
    try {
      classifications = await classifyFunderEmails({
        emails: toClassify.map(c => ({
          subject: c.msg.subject,
          from: c.msg.from_address,
          snippet: c.msg.snippet,
          funder: c.grant.funder_name
        }))
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Email classification failed; recording findings unclassified');
    }
  }

  let created = 0;
  for (let i = 0; i < toClassify.length; i++) {
    const { msg, grant } = toClassify[i];
    const verdict = classifications.find(c => c.index === i) || {};

    await EmailFinding.create({
      org_id: orgId,
      grant_id: grant.id,
      message_uid: msg.message_uid,
      subject: msg.subject,
      from_address: msg.from_address,
      received_at: msg.received_at,
      snippet: msg.snippet.slice(0, 600),
      classification: verdict.classification || 'unclear',
      confidence: verdict.confidence || 'low',
      reasoning: verdict.reasoning || null,
      proposed_status: proposedStatusFor(verdict.classification)
    });
    created++;
  }

  const result = {
    scanned: messages.length,
    matched: candidates.length,
    classified: toClassify.length,
    created,
    skipped: null
  };
  logger.info({ orgId, ...result }, 'Inbox scan complete');
  return result;
}

/** Map a classification to the grant status it would imply. */
function proposedStatusFor(classification) {
  switch (classification) {
    case 'awarded': return 'funded';
    case 'rejected': return 'rejected';
    // An information request or acknowledgment means it is still live — worth
    // surfacing, but there is no status change to propose.
    default: return null;
  }
}

module.exports = {
  scanForOrg,
  isConfigured,
  matchToGrant,
  funderTokens,
  proposedStatusFor,
  LOOKBACK_DAYS
};
