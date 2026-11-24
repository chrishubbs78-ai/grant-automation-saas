/**
 * The automation runner: one pass does everything the owner would otherwise
 * click through, and records each action so nothing happens invisibly.
 *
 *   1. Discover new grant opportunities (Grants.gov, IRS 990 foundations, Utah directory)
 *   2. Auto-start applications for strong matches (score at or above the threshold)
 *   3. Write tailored drafts for applications that have none
 *   4. Refresh reapply eligibility and run auto-reapplies
 *   5. Save proposals to Drive, prepare email submissions in Gmail,
 *      and send them when auto-send is on and nothing blocks them
 *   6. Sync every deadline to Google Calendar
 *   7. Scan the inbox for funder replies
 *   8. List what only the owner can do (portal submissions, signatures, missing documents)
 *   9. Email the owner a digest of the run
 *
 * Each step is isolated: a failure is recorded and the run continues.
 */
const { Op } = require('sequelize');
const {
  Organization, OpportunityMatch, Grant, Draft, RFPAnalysis, ReapplyCandidate, AutomationRun, LoanApplication
} = require('../models');
const logger = require('../utils/logger');

const DEFAULT_SETTINGS = {
  enabled: false,
  auto_discover: true,
  auto_start_min_score: 80,
  max_new_applications_per_run: 3,
  auto_draft: true,
  auto_reapply: true,
  gmail_drafts: true,
  auto_send_email_submissions: false,
  calendar_sync: true,
  drive_sync: true,
  inbox_scan: true,
  digest_email: true,
  reminder_days: [14, 7, 2]
};

function settingsFor(org) {
  return { ...DEFAULT_SETTINGS, ...(org.automationSettings || {}) };
}

const SETTING_TYPES = {
  enabled: 'boolean', auto_discover: 'boolean', auto_draft: 'boolean', auto_reapply: 'boolean',
  gmail_drafts: 'boolean', auto_send_email_submissions: 'boolean', calendar_sync: 'boolean',
  drive_sync: 'boolean', inbox_scan: 'boolean', digest_email: 'boolean',
  auto_start_min_score: 'number', max_new_applications_per_run: 'number', reminder_days: 'array'
};

/** Accept only known settings with the right types and sane ranges. */
function sanitizeSettings(input = {}) {
  const out = {};
  for (const [k, type] of Object.entries(SETTING_TYPES)) {
    if (!(k in input)) continue;
    const v = input[k];
    if (type === 'boolean' && typeof v === 'boolean') out[k] = v;
    if (type === 'number' && Number.isFinite(Number(v))) out[k] = Number(v);
    if (type === 'array' && Array.isArray(v)) {
      out[k] = v.map(Number).filter(n => Number.isInteger(n) && n > 0 && n <= 60).slice(0, 5);
    }
  }
  if ('auto_start_min_score' in out) out.auto_start_min_score = Math.max(50, Math.min(100, out.auto_start_min_score));
  if ('max_new_applications_per_run' in out) out.max_new_applications_per_run = Math.max(0, Math.min(10, Math.round(out.max_new_applications_per_run)));
  return out;
}

async function step(run, name, fn) {
  try {
    const result = await fn();
    if (result !== undefined && result !== null) run.actions.push({ step: name, outcome: 'ok', detail: result });
  } catch (error) {
    logger.error({ step: name, error: error.message }, 'Automation step failed');
    run.actions.push({ step: name, outcome: 'error', detail: error.message });
  }
}

async function runForOrg(orgId, { trigger = 'manual' } = {}) {
  const org = await Organization.findByPk(orgId);
  if (!org) throw new Error('Organization not found');
  const settings = settingsFor(org);

  const record = await AutomationRun.create({ org_id: orgId, trigger, status: 'running' });
  const run = { actions: [], needs_you: [] };

  const google = require('./googleService');
  const conn = google.isConfigured() ? await google.getConnection(orgId) : null;
  const googleSync = require('./googleSync');

  // 1. Discovery
  if (settings.auto_discover) {
    await step(run, 'discover', async () => {
      const { runDiscovery } = require('./matchingEngine');
      const result = await runDiscovery(orgId);
      return `Found ${result.discovered} opportunities (${result.new} new), scored ${result.scored}.`;
    });
  }

  // 2. Auto-start strong matches
  if (settings.max_new_applications_per_run > 0) {
    await step(run, 'start_applications', async () => {
      const { convertMatchToGrant } = require('./opportunityConversion');
      const matches = await OpportunityMatch.findAll({
        where: { org_id: orgId, status: ['new', 'reviewed'], fit_score: { [Op.gte]: settings.auto_start_min_score } },
        include: [{ association: 'opportunity' }],
        order: [['fit_score', 'DESC']],
        limit: settings.max_new_applications_per_run
      });
      const started = [];
      for (const match of matches) {
        if (!match.opportunity) continue;
        if (match.opportunity.close_date && new Date(match.opportunity.close_date) < new Date()) continue;
        const { grant } = await convertMatchToGrant(org, match);
        started.push(`${grant.funder_name} (score ${match.fit_score})`);
      }
      return started.length ? `Started ${started.length} application(s): ${started.join(', ')}.` : null;
    });
  }

  // 3. Drafts for applications without one
  if (settings.auto_draft) {
    await step(run, 'write_drafts', async () => {
      const { generateAndStoreDraft } = require('./draftPipeline');
      const grants = await Grant.findAll({
        where: {
          org_id: orgId,
          status: 'draft',
          [Op.or]: [{ deadline: null }, { deadline: { [Op.gte]: new Date() } }]
        },
        order: [['deadline', 'ASC NULLS LAST']],
        limit: 10
      });
      const written = [];
      for (const grant of grants) {
        const hasDraft = await Draft.count({ where: { grant_id: grant.id } });
        if (hasDraft) continue;
        const rfp = await RFPAnalysis.findOne({ where: { grant_id: grant.id, org_id: orgId } });
        if (!rfp) continue;
        await generateAndStoreDraft({ org, rfp });
        written.push(grant.funder_name);
        if (written.length >= 3) break; // keep Claude spend per run bounded
      }
      return written.length ? `Wrote ${written.length} draft(s): ${written.join(', ')}.` : null;
    });
  }

  // 4. Reapply
  if (settings.auto_reapply) {
    await step(run, 'reapply', async () => {
      const { detectCandidates, refreshEligibility, executeReapply } = require('./reapplyService');
      await detectCandidates(orgId);
      await refreshEligibility(orgId);
      const eligible = await ReapplyCandidate.findAll({ where: { org_id: orgId, status: 'eligible' }, limit: 3 });
      const done = [];
      for (const c of eligible) {
        const result = await executeReapply(c.id, orgId);
        done.push(result.grant.funder_name);
      }
      return done.length ? `Reapplied with improved drafts: ${done.join(', ')}.` : null;
    });
  }

  // 5. Drive copies and Gmail submissions
  if (conn) {
    const active = await Grant.findAll({ where: { org_id: orgId, status: 'draft' } });

    if (settings.drive_sync) {
      await step(run, 'drive', async () => {
        let saved = 0;
        for (const g of active) {
          if (await googleSync.saveGrantToDrive(conn, org, g)) saved += 1;
        }
        const loans = await LoanApplication.findAll({ where: { org_id: orgId, status: ['researching', 'preparing'] } });
        for (const l of loans) {
          if (l.loan_package && l.loan_package.cover_letter) { await googleSync.saveLoanPackageToDrive(conn, org, l); saved += 1; }
        }
        return saved ? `Saved ${saved} editable document(s) to Google Drive.` : null;
      });
    }

    if (settings.gmail_drafts) {
      await step(run, 'email_submissions', async () => {
        const prepared = [];
        const sent = [];
        for (const g of active.filter(x => x.submission_method === 'email')) {
          const blockers = await googleSync.submissionBlockers(g);
          if (blockers.length === 0 && settings.auto_send_email_submissions) {
            await googleSync.sendEmailSubmission(conn, org, g);
            sent.push(g.funder_name);
          } else if (await Draft.count({ where: { grant_id: g.id } }) && g.submission_email) {
            await googleSync.prepareEmailSubmission(conn, org, g);
            prepared.push(g.funder_name);
          }
        }
        const parts = [];
        if (sent.length) parts.push(`Sent ${sent.length} email submission(s): ${sent.join(', ')}.`);
        if (prepared.length) parts.push(`Prepared ${prepared.length} submission email(s) in Gmail drafts: ${prepared.join(', ')}.`);
        return parts.length ? parts.join(' ') : null;
      });
    }
  }

  // 6. Calendar
  if (conn && settings.calendar_sync) {
    await step(run, 'calendar', async () => {
      const { upcomingItems } = require('./reminderService');
      const items = await upcomingItems(orgId);
      const events = await googleSync.syncCalendar(conn, items, settings.reminder_days);
      const created = events.filter(e => e.created).length;
      return events.length ? `Calendar up to date: ${events.length} date(s), ${created} new.` : null;
    });
  }

  // 7. Inbox
  if (settings.inbox_scan) {
    await step(run, 'inbox', async () => {
      const { scanForOrg } = require('./emailScanService');
      const result = await scanForOrg(orgId);
      if (result.skipped) return null;
      return `Checked ${result.scanned} email(s); ${result.created} funder reply(ies) need your confirmation.`;
    });
  }

  // 8. What only the owner can do
  await step(run, 'needs_you', async () => {
    run.needs_you = await ownerActions(org, conn, settings);
    return null;
  });

  // 9. Digest email to the owner's own address
  if (conn && settings.digest_email && conn.google_email && (run.actions.length || run.needs_you.length)) {
    await step(run, 'digest', async () => {
      const text = digestText(org, run);
      const draft = await google.createDraft(conn, { to: conn.google_email, subject: `Grant & loan update for ${org.name}`, text });
      await google.sendDraft(conn, draft.id);
      return `Emailed you a summary at ${conn.google_email}.`;
    });
  }

  const failed = run.actions.some(a => a.outcome === 'error');
  await record.update({
    status: failed ? 'partial' : 'completed',
    actions: run.actions,
    needs_you: run.needs_you,
    finished_at: new Date()
  });
  return record;
}

/** Things the runner cannot do for the owner, soonest first. */
async function ownerActions(org, conn, settings) {
  const googleSync = require('./googleSync');
  const items = [];
  const grants = await Grant.findAll({
    where: { org_id: org.id, status: 'draft', [Op.or]: [{ deadline: null }, { deadline: { [Op.gte]: new Date() } }] },
    order: [['deadline', 'ASC NULLS LAST']]
  });
  const sponsor = org.fiscalSponsor || {};

  for (const g of grants) {
    const hasDraft = await Draft.count({ where: { grant_id: g.id } });
    if (!hasDraft) continue;
    const due = g.deadline ? ` by ${new Date(g.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '';

    if (g.applicant_lane === 'sponsored_program' && !sponsor.name) {
      items.push({ grant_id: g.id, kind: 'fiscal_sponsor', message: `${g.funder_name}: needs a fiscal sponsor before the youth program can apply.` });
      continue;
    }
    if (g.applicant_lane === 'sponsored_program') {
      items.push({ grant_id: g.id, kind: 'sponsor_signoff', message: `${g.funder_name}: send the draft to ${sponsor.name} for sign-off${due}. Sponsors usually submit or co-sign.` });
    }
    if (g.submission_method === 'email') {
      const blockers = await googleSync.submissionBlockers(g);
      if (blockers.length) {
        items.push({ grant_id: g.id, kind: 'blocked', message: `${g.funder_name}: ${blockers.join('; ')}.` });
      } else if (!settings.auto_send_email_submissions) {
        items.push({ grant_id: g.id, kind: 'review_and_send', message: `${g.funder_name}: submission email is ready in Gmail drafts. Review and send${due}.` });
      }
    } else {
      items.push({
        grant_id: g.id,
        kind: 'portal',
        message: `${g.funder_name}: submit on the funder's portal${due}. The proposal is ready${(g.google && g.google.drive_link) ? ' in Google Drive' : ''}; sign in, paste or upload it, and sign any certifications.`
      });
    }
  }

  const loans = await LoanApplication.findAll({ where: { org_id: org.id, status: ['preparing'] } });
  for (const l of loans) {
    items.push({ loan_id: l.id, kind: 'loan', message: `Loan${l.lender_name ? ` with ${l.lender_name}` : ''}: lenders need your signature on the application, personal financial statement and tax transcript request.` });
  }
  if (!conn) {
    items.push({ kind: 'connect_google', message: 'Connect Google so drafts, deadlines and documents sync to Gmail, Calendar and Drive.' });
  }
  return items;
}

function digestText(org, run) {
  const did = run.actions.filter(a => a.outcome === 'ok').map(a => `• ${a.detail}`);
  const errors = run.actions.filter(a => a.outcome === 'error').map(a => `• ${a.step}: ${a.detail}`);
  const todo = run.needs_you.map(n => `• ${n.message}`);
  return [
    `Here is today's update for ${org.name}.`,
    '',
    did.length ? 'DONE AUTOMATICALLY' : null,
    ...did,
    '',
    todo.length ? 'NEEDS YOU' : null,
    ...todo,
    '',
    errors.length ? 'PROBLEMS' : null,
    ...errors
  ].filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Scheduler entry point: every org that turned automation on. */
async function runAllEnabled() {
  const orgs = await Organization.findAll({ attributes: ['id', 'automationSettings'] });
  const results = [];
  for (const org of orgs) {
    if (!settingsFor(org).enabled) continue;
    try {
      const r = await runForOrg(org.id, { trigger: 'scheduled' });
      results.push({ orgId: org.id, status: r.status });
    } catch (error) {
      results.push({ orgId: org.id, status: 'failed', error: error.message });
    }
  }
  return results;
}

module.exports = { runForOrg, runAllEnabled, settingsFor, sanitizeSettings, ownerActions, digestText, DEFAULT_SETTINGS };
