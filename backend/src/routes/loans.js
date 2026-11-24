const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyToken } = require('../middleware/auth');
const { Organization, LoanApplication } = require('../models');
const {
  LOAN_PROGRAMS, LOAN_STATUSES, assessReadiness, rankPrograms, generateLoanPackage
} = require('../services/loanService');
const { safeError } = require('../utils/safeError');
const logger = require('../utils/logger');
const router = express.Router();

const packageRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: 'Too many loan packet requests. Please wait before trying again.'
});

const PROFILE_NUMBERS = ['amount_needed', 'owner_credit_score', 'owner_equity', 'months_in_business', 'startup_costs', 'monthly_revenue_projection', 'industry_experience_years'];
const PROFILE_FLAGS = ['has_projections', 'has_tax_returns', 'has_personal_financial_statement', 'buying_property'];
const PROFILE_TEXT = ['collateral', 'notes'];

async function getOrg(req, res) {
  const org = await Organization.findOne({ where: { userId: req.user.userId } });
  if (!org) {
    res.status(404).json({ success: false, error: 'Organization not found. Complete your profile first.' });
    return null;
  }
  return org;
}

function cleanProfile(input = {}) {
  const out = {};
  for (const k of PROFILE_NUMBERS) {
    if (input[k] === '' || input[k] === null) out[k] = null;
    else if (input[k] !== undefined) {
      const n = Number(input[k]);
      if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error(`${k} must be a non-negative number`), { status: 400 });
      out[k] = n;
    }
  }
  for (const k of PROFILE_FLAGS) if (input[k] !== undefined) out[k] = Boolean(input[k]);
  for (const k of PROFILE_TEXT) if (input[k] !== undefined) out[k] = String(input[k] || '').slice(0, 2000);
  if (input.use_of_funds !== undefined) {
    if (!Array.isArray(input.use_of_funds)) throw Object.assign(new Error('use_of_funds must be an array'), { status: 400 });
    out.use_of_funds = input.use_of_funds.slice(0, 30).map(u => (typeof u === 'string'
      ? { item: u.slice(0, 200), amount: null }
      : { item: String(u.item || '').slice(0, 200), amount: Number.isFinite(Number(u.amount)) ? Number(u.amount) : null, note: u.note ? String(u.note).slice(0, 300) : undefined }));
  }
  return out;
}

// GET /api/loans/overview — profile, readiness, ranked programs, applications
router.get('/overview', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const applications = await LoanApplication.findAll({ where: { org_id: org.id }, order: [['updated_at', 'DESC']] });
    res.json({
      success: true,
      data: {
        profile: org.loanProfile || {},
        readiness: assessReadiness(org),
        programs: rankPrograms(org),
        applications,
        statuses: LOAN_STATUSES
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// GET /api/loans/programs — the catalog, unranked
router.get('/programs', verifyToken, (req, res) => {
  res.json({ success: true, data: LOAN_PROGRAMS });
});

// PUT /api/loans/profile — lender-facing facts (partial updates merge)
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const updates = cleanProfile(req.body || {});
    await org.update({ loanProfile: { ...(org.loanProfile || {}), ...updates } });
    res.json({ success: true, data: { profile: org.loanProfile, readiness: assessReadiness(org), programs: rankPrograms(org) } });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.status ? error.message : safeError(error) });
  }
});

// POST /api/loans/applications — start tracking a loan
router.post('/applications', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const { program_key, lender_name, amount_requested, next_step, next_step_date, notes } = req.body || {};
    if (program_key && !LOAN_PROGRAMS.some(p => p.key === program_key)) {
      return res.status(400).json({ success: false, error: 'Unknown program_key' });
    }
    const program = LOAN_PROGRAMS.find(p => p.key === program_key);
    const loan = await LoanApplication.create({
      org_id: org.id,
      program_key: program_key || null,
      lender_name: lender_name || (program ? program.name : null),
      amount_requested: amount_requested || (org.loanProfile && org.loanProfile.amount_needed) || null,
      next_step: next_step || (program ? program.how_to_apply : null),
      next_step_date: next_step_date || null,
      notes: notes || null
    });
    res.status(201).json({ success: true, data: loan });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// PATCH /api/loans/applications/:id — status, lender, next step, terms
router.patch('/applications/:id', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const loan = await LoanApplication.findOne({ where: { id: req.params.id, org_id: org.id } });
    if (!loan) return res.status(404).json({ success: false, error: 'Loan application not found' });

    const allowed = ['lender_name', 'lender_contact', 'amount_requested', 'status', 'next_step', 'next_step_date', 'terms', 'notes'];
    const updates = {};
    for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
    if (updates.status && !LOAN_STATUSES.includes(updates.status)) {
      return res.status(400).json({ success: false, error: `status must be one of: ${LOAN_STATUSES.join(', ')}` });
    }
    if (updates.status === 'submitted' && !loan.submitted_at) updates.submitted_at = new Date();
    if (['approved', 'declined', 'funded'].includes(updates.status) && !loan.decided_at) updates.decided_at = new Date();
    await loan.update(updates);
    res.json({ success: true, data: loan });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// DELETE /api/loans/applications/:id
router.delete('/applications/:id', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const deleted = await LoanApplication.destroy({ where: { id: req.params.id, org_id: org.id } });
    if (!deleted) return res.status(404).json({ success: false, error: 'Loan application not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST /api/loans/applications/:id/package — write the lender packet
router.post('/applications/:id/package', verifyToken, packageRateLimit, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const loan = await LoanApplication.findOne({ where: { id: req.params.id, org_id: org.id } });
    if (!loan) return res.status(404).json({ success: false, error: 'Loan application not found' });

    const pkg = await generateLoanPackage(org, {
      programKey: loan.program_key,
      lenderName: loan.lender_name,
      amount: loan.amount_requested
    });
    await loan.update({ loan_package: pkg, status: loan.status === 'researching' ? 'preparing' : loan.status });

    // Best effort: drop an editable copy in Drive when Google is connected.
    let drive = null;
    try {
      const google = require('../services/googleService');
      const conn = google.isConfigured() ? await google.getConnection(org.id) : null;
      if (conn) drive = await require('../services/googleSync').saveLoanPackageToDrive(conn, org, loan);
    } catch (error) {
      logger.warn({ error: error.message }, 'Could not save loan packet to Drive');
    }

    res.json({ success: true, data: { loan, drive } });
  } catch (error) {
    logger.error({ error: error.message }, 'Loan packet generation failed');
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

module.exports = router;
