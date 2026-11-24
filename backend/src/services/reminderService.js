/**
 * Everything with a date: grant deadlines, reopened funding cycles and loan
 * next steps, in one timeline. Feeds the dashboard, the .ics calendar export
 * and Google Calendar sync.
 */
const { Op } = require('sequelize');
const { Grant, ReapplyCandidate, LoanApplication } = require('../models');

const DEFAULT_REMINDER_DAYS = [14, 7, 2];
const ACTIVE_LOAN_STATUSES = ['researching', 'preparing', 'submitted', 'in_underwriting', 'approved'];

function daysUntil(date, now = Date.now()) {
  return Math.ceil((new Date(date).getTime() - now) / 86400000);
}

async function upcomingItems(orgId, { horizonDays = 180, now = new Date() } = {}) {
  const horizon = new Date(now.getTime() + horizonDays * 86400000);
  const items = [];

  const grants = await Grant.findAll({
    where: { org_id: orgId, status: ['draft', 'submitted', 'pending'], deadline: { [Op.between]: [now, horizon] } },
    order: [['deadline', 'ASC']]
  });
  for (const g of grants) {
    const filed = g.status !== 'draft';
    items.push({
      key: `grant:${g.id}:deadline`,
      kind: 'grant_deadline',
      id: g.id,
      title: filed ? `Decision window: ${g.funder_name}` : `Grant due: ${g.funder_name}`,
      date: g.deadline,
      days_left: daysUntil(g.deadline, now.getTime()),
      detail: [
        g.amount ? `Request: $${Number(g.amount).toLocaleString()}` : null,
        g.applicant_lane === 'sponsored_program' ? 'Applies as the youth program through the fiscal sponsor' : null,
        g.applicant_lane === 'business' ? 'Applies as the business' : null,
        filed ? 'Already submitted' : (g.submission_method === 'portal' ? 'Submit on the funder portal' : null)
      ].filter(Boolean).join(' · ')
    });
  }

  const candidates = await ReapplyCandidate.findAll({
    where: { org_id: orgId, status: ['pending', 'eligible'], next_cycle_date: { [Op.between]: [now, horizon] } },
    include: [{ association: 'originalGrant', attributes: ['funder_name'] }]
  });
  for (const c of candidates) {
    const funder = (c.originalGrant && c.originalGrant.funder_name) || 'funder';
    items.push({
      key: `reapply:${c.id}:cycle`,
      kind: 'reapply_cycle',
      id: c.id,
      title: `Reapply: ${funder} next cycle`,
      date: c.next_cycle_date,
      days_left: daysUntil(c.next_cycle_date, now.getTime()),
      detail: c.status === 'eligible' ? 'Eligible to reapply now' : 'Opens soon'
    });
  }

  const loans = await LoanApplication.findAll({
    where: { org_id: orgId, status: ACTIVE_LOAN_STATUSES, next_step_date: { [Op.between]: [now, horizon] } }
  });
  for (const l of loans) {
    items.push({
      key: `loan:${l.id}:next`,
      kind: 'loan_step',
      id: l.id,
      title: `Loan: ${l.next_step || 'next step'}${l.lender_name ? ` (${l.lender_name})` : ''}`,
      date: l.next_step_date,
      days_left: daysUntil(l.next_step_date, now.getTime()),
      detail: l.amount_requested ? `$${Number(l.amount_requested).toLocaleString()} ${l.status}` : l.status
    });
  }

  return items.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function icsEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsDate(date) {
  return new Date(date).toISOString().slice(0, 10).replace(/-/g, '');
}

/** RFC 5545 calendar with all-day events and an alarm per reminder day. */
function buildIcs(items, { reminderDays = DEFAULT_REMINDER_DAYS, now = new Date() } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Grant Automation//Deadlines//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Grant & Loan Deadlines'
  ];
  for (const item of items) {
    const start = icsDate(item.date);
    const end = icsDate(new Date(new Date(item.date).getTime() + 86400000));
    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.key}@grant-automation`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsEscape(item.title)}`,
      `DESCRIPTION:${icsEscape(item.detail)}`
    );
    for (const d of reminderDays) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(item.title)}`, `TRIGGER:-P${d}D`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

module.exports = { upcomingItems, buildIcs, daysUntil, DEFAULT_REMINDER_DAYS };
