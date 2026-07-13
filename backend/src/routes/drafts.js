const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { verifyToken } = require('../middleware/auth');
const { Organization, Grant, RFPAnalysis, Draft, Analytics } = require('../models');
const { generateDraft } = require('../services/claudeService');
const { emitToUser } = require('../services/socketService');
const { safeError } = require('../utils/safeError');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const router = express.Router();

// MED-3: per-user rate limit on draft generation (10 drafts per hour)
const draftRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many draft requests. Please wait before trying again.'
});

// Store job status (in-memory for MVP, use Redis in production)
const jobStatus = new Map();

// POST generate draft
router.post('/generate', verifyToken, draftRateLimit, async (req, res) => {
  try {
    const { rfpAnalysisId } = req.body;

    if (!rfpAnalysisId) {
      return res.status(400).json({
        success: false,
        error: 'rfpAnalysisId required'
      });
    }

    // Check organization first (more fundamental than RFP)
    const org = await Organization.findOne({
      where: { userId: req.user.userId }
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    // MED-8: scope RFP lookup to caller's org — prevents using another org's parsed RFP
    const rfp = await RFPAnalysis.findOne({ where: { id: rfpAnalysisId, org_id: org.id } });
    if (!rfp) {
      return res.status(404).json({
        success: false,
        error: 'RFP Analysis not found'
      });
    }

    const jobId = uuidv4();
    const userId = req.user.userId;
    jobStatus.set(jobId, { status: 'processing', progress: 10, orgId: org.id });

    // Start async draft generation
    processDraft(jobId, rfpAnalysisId, org.id, org, userId).catch(error => {
      jobStatus.set(jobId, { status: 'error', error: error.message, orgId: org.id });
      emitToUser(userId, 'draft:error', { jobId, error: error.message });
    });

    res.json({
      success: true,
      data: {
        jobId,
        status: 'processing',
        message: 'Draft generation in progress. Check status with this jobId.'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: safeError(error)
    });
  }
});

// GET draft result
router.get('/:jobId', verifyToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = jobStatus.get(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    // HIGH-1: verify the job belongs to the requesting user's org
    const org = await Organization.findOne({ where: { userId: req.user.userId } });
    if (!org || job.orgId !== org.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    if (job.status === 'processing') {
      return res.json({
        success: true,
        data: {
          jobId,
          status: 'processing',
          progress: job.progress || 50
        }
      });
    }

    if (job.status === 'error') {
      return res.status(400).json({
        success: false,
        error: job.error
      });
    }

    if (job.status === 'complete') {
      return res.json({
        success: true,
        data: {
          jobId,
          status: 'complete',
          draft: job.draft
        }
      });
    }

    res.status(400).json({
      success: false,
      error: 'Unknown job status'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: safeError(error)
    });
  }
});

// Background job: Generate draft
async function processDraft(jobId, rfpAnalysisId, orgId, org, userId) {
  try {
    jobStatus.set(jobId, { status: 'processing', progress: 20, orgId });
    emitToUser(userId, 'draft:progress', { jobId, progress: 20, status: 'processing' });

    const rfp = await RFPAnalysis.findByPk(rfpAnalysisId);

    if (!rfp) {
      throw new Error('RFP not found');
    }

    jobStatus.set(jobId, { status: 'processing', progress: 40, orgId });
    emitToUser(userId, 'draft:progress', { jobId, progress: 40, status: 'processing' });

    // Pull learning analytics to feed into draft generation
    const analytics = await Analytics.findOne({ where: { org_id: orgId } });

    // Generate expert draft with full org profile + RFP context + learning insights
    logger.info({ jobId, orgId }, 'Generating expert draft with Claude...');
    const draft = await generateDraft({
      orgProfile: org.get({ plain: true }),
      rfpAnalysis: rfp.get({ plain: true }),
      analytics: analytics ? analytics.get({ plain: true }) : null
    });

    jobStatus.set(jobId, { status: 'processing', progress: 80, orgId });
    emitToUser(userId, 'draft:progress', { jobId, progress: 80, status: 'processing' });

    // Store all 8 draft sections in database
    const draftRecord = await Draft.create({
      grant_id: rfp.grant_id,
      org_id: orgId,
      version: 1,
      // Legacy fields (mapped for backward compat)
      problem_statement: draft.statement_of_need || draft.problem_statement || '',
      impact_statement: draft.goals_and_objectives || draft.impact_statement || '',
      budget_narrative: draft.budget_narrative || '',
      // New expert sections
      executive_summary: draft.executive_summary || '',
      organization_background: draft.organization_background || '',
      statement_of_need: draft.statement_of_need || '',
      goals_and_objectives: draft.goals_and_objectives || '',
      program_design: draft.program_design || '',
      evaluation_plan: draft.evaluation_plan || '',
      sustainability_plan: draft.sustainability_plan || ''
    });

    const draftPlain = draftRecord.get({ plain: true });
    jobStatus.set(jobId, { status: 'complete', progress: 100, orgId, draft: draftPlain });
    emitToUser(userId, 'draft:complete', { jobId, draft: draftPlain });

    logger.info({ jobId }, 'Draft generation complete');
  } catch (error) {
    logger.error({ jobId, error: error.message }, 'Error generating draft');
    jobStatus.set(jobId, { status: 'error', error: error.message, orgId });
    emitToUser(userId, 'draft:error', { jobId, error: error.message });
  }
}

module.exports = router;
