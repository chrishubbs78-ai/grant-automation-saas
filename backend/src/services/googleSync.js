/**
 * Puts the tool's work where the owner already lives: deadlines in Google
 * Calendar, an editable Google Doc of every proposal and loan packet in Drive,
 * and email submissions ready (or sent) in Gmail.
 *
 * What it cannot do, and says so: web-portal submissions (Grants.gov,
 * Submittable, Fluxx and most foundation portals) need the owner signed in,
 * and certifications or signatures need the owner's own hand.
 */
const { Grant, Draft, ApplicationDocument, RFPAnalysis } = require('../models');
const google = require('./googleService');
const { buildProposalDocx, buildSectionsDocx, proposalText } = require('./exportService');
const { DEFAULT_REMINDER_DAYS } = require('./reminderService');

function safeName(text) {
  return String(text || '').replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '_') || 'Untitled';
}

async function latestDraft(grantId) {
  return Draft.findOne({ where: { grant_id: grantId }, order: [['version', 'DESC']] });
}

async function proposalDocx(org, grant, draft) {
  const rfp = await RFPAnalysis.findOne({ where: { grant_id: grant.id }, order: [['created_at', 'DESC']] }).catch(() => null);
  return buildProposalDocx({
    org: org.get ? org.get({ plain: true }) : org,
    grant: grant.get({ plain: true }),
    draft: draft.get({ plain: true }),
    rfpAnalysis: rfp ? rfp.get({ plain: true }) : null
  });
}

/** What still blocks an email submission, empty when it can go. */
async function submissionBlockers(grant) {
  const blockers = [];
  if (grant.status !== 'draft') blockers.push(`Already ${grant.status}`);
  if (grant.submission_method !== 'email') blockers.push('This funder does not take email submissions');
  if (!grant.submission_email) blockers.push('No submission email address on file');
  if (grant.deadline && new Date(grant.deadline) < new Date()) blockers.push('Deadline has passed');
  const draft = await latestDraft(grant.id);
  if (!draft) blockers.push('No proposal draft yet');
  const missingDocs = await ApplicationDocument.count({
    where: { grant_id: grant.id, required: true, status: 'needed' }
  });
  if (missingDocs > 0) blockers.push(`${missingDocs} required document(s) not attached yet`);
  return blockers;
}

function coverNote(org, grant) {
  const sponsor = org.fiscalSponsor || {};
  const applicant = grant.applicant_lane === 'sponsored_program' && sponsor.name
    ? `${sponsor.program_name || `${org.name} Youth Program`}, a fiscally sponsored project of ${sponsor.name}`
    : org.name;
  return [
    `Dear ${grant.funder_name || 'Grants'} Review Team,`,
    '',
    `On behalf of ${applicant}, please find attached our proposal${grant.amount ? ` requesting $${Number(grant.amount).toLocaleString()}` : ''}${grant.deadline ? ` for the cycle closing ${new Date(grant.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}.`,
    '',
    'The full proposal is attached as a Word document, along with the supporting documents you requested. The proposal text is also included below for your convenience.',
    '',
    'Thank you for your consideration. Please let us know if you need anything further.',
    '',
    'Sincerely,',
    org.name,
    [org.phone, org.website].filter(Boolean).join(' · ')
  ].join('\n');
}

/** Create or refresh the Gmail draft for an email submission. */
async function prepareEmailSubmission(conn, org, grant) {
  const draft = await latestDraft(grant.id);
  if (!draft) throw new Error('No proposal draft yet');
  if (!grant.submission_email) throw new Error('No submission email address on file');

  const docx = await proposalDocx(org, grant, draft);
  const attachments = [{
    filename: `${safeName(org.name)}_Proposal_${safeName(grant.funder_name)}.docx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    content: docx
  }];
  const docs = await ApplicationDocument.findAll({ where: { grant_id: grant.id, status: 'attached' } });
  for (const d of docs) {
    if (!d.file_data) continue;
    attachments.push({ filename: d.file_name || `${safeName(d.label)}.pdf`, mimeType: d.mime_type, content: Buffer.from(d.file_data, 'base64') });
  }

  const text = `${coverNote(org, grant)}\n\n---\n\n${proposalText({ draft: draft.get({ plain: true }) })}`;
  const g = grant.google || {};
  const result = await google.createDraft(conn, {
    to: grant.submission_email,
    subject: `Grant proposal: ${org.name}${grant.funder_name ? ` to ${grant.funder_name}` : ''}`,
    text,
    attachments
  }, g.gmail_draft_id || null);

  await grant.update({ google: { ...g, gmail_draft_id: result.id, gmail_draft_prepared_at: new Date().toISOString() } });
  return result;
}

/** Send the prepared submission and mark the grant submitted. */
async function sendEmailSubmission(conn, org, grant) {
  const blockers = await submissionBlockers(grant);
  if (blockers.length) {
    const err = new Error(`Not ready to send: ${blockers.join('; ')}`);
    err.status = 409;
    throw err;
  }
  // Always rebuild first, so what goes out matches the latest draft.
  const prepared = await prepareEmailSubmission(conn, org, grant);
  const sent = await google.sendDraft(conn, prepared.id);
  const g = grant.google || {};
  await grant.update({
    status: 'submitted',
    submitted_at: new Date(),
    google: { ...g, gmail_draft_id: null, gmail_message_id: sent.message_id, gmail_thread_id: sent.thread_id }
  });
  return sent;
}

/** Save the proposal to Drive as an editable Google Doc. */
async function saveGrantToDrive(conn, org, grant) {
  const draft = await latestDraft(grant.id);
  if (!draft) return null;
  const buffer = await proposalDocx(org, grant, draft);
  const g = grant.google || {};
  const file = await google.saveDocToDrive(conn, {
    name: `${org.name} – ${grant.funder_name || 'Grant'} proposal`,
    buffer,
    existingFileId: g.drive_file_id || null
  });
  await grant.update({ google: { ...grant.google, drive_file_id: file.id, drive_link: file.link } });
  return file;
}

async function saveBusinessPlanToDrive(conn, org, sections) {
  const buffer = await buildSectionsDocx({
    title: `${org.name} Business Plan`,
    subtitle: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    sections
  });
  const builder = org.businessPlanBuilder || {};
  const file = await google.saveDocToDrive(conn, {
    name: `${org.name} – Business Plan`,
    buffer,
    existingFileId: builder.drive_file_id || null
  });
  await org.update({ businessPlanBuilder: { ...builder, drive_file_id: file.id, drive_link: file.link } });
  return file;
}

async function saveLoanPackageToDrive(conn, org, loan) {
  const p = loan.loan_package || {};
  const useOfFunds = Array.isArray(p.use_of_funds)
    ? p.use_of_funds.map(u => `• ${u.item}${u.amount ? `: $${Number(u.amount).toLocaleString()}` : ''}${u.note ? ` (${u.note})` : ''}`).join('\n')
    : '';
  const buffer = await buildSectionsDocx({
    title: `${org.name} Loan Request`,
    subtitle: [loan.lender_name, loan.amount_requested ? `$${Number(loan.amount_requested).toLocaleString()}` : null].filter(Boolean).join(' · '),
    sections: [
      { heading: 'Cover Letter', body: p.cover_letter },
      { heading: 'Loan Request Summary', body: p.loan_request_summary },
      { heading: 'Use of Funds', body: useOfFunds },
      { heading: 'Repayment Ability', body: p.repayment_ability },
      { heading: 'Owner Contribution & Collateral', body: p.owner_contribution_and_collateral },
      { heading: 'Management', body: p.management_summary },
      { heading: 'Risks & Mitigations', body: p.risks_and_mitigations },
      { heading: 'Community Impact', body: p.community_impact },
      { heading: 'Document Checklist', body: (p.document_checklist || []).map(d => `• ${d}`).join('\n') }
    ]
  });
  const g = loan.google || {};
  const file = await google.saveDocToDrive(conn, {
    name: `${org.name} – Loan Request${loan.lender_name ? ` (${loan.lender_name})` : ''}`,
    buffer,
    existingFileId: g.drive_file_id || null
  });
  await loan.update({ google: { ...g, drive_file_id: file.id, drive_link: file.link } });
  return file;
}

/** Push every upcoming date to Google Calendar. Reruns update, never duplicate. */
async function syncCalendar(conn, items, reminderDays = DEFAULT_REMINDER_DAYS) {
  const results = [];
  for (const item of items) {
    const event = await google.upsertDeadlineEvent(conn, {
      key: item.key,
      summary: item.title,
      description: item.detail,
      date: item.date,
      reminderDays
    });
    results.push({ key: item.key, ...event });
  }
  return results;
}

module.exports = {
  submissionBlockers,
  prepareEmailSubmission,
  sendEmailSubmission,
  saveGrantToDrive,
  saveBusinessPlanToDrive,
  saveLoanPackageToDrive,
  syncCalendar,
  coverNote
};
