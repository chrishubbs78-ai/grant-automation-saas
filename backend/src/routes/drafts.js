const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { verifyToken } = require('../middleware/auth');
const { Organization, Grant, RFPAnalysis, Draft } = require('../models');
const { generateDraft } = require('../services/claudeService');
const logger = require('../utils/logger');
const router = express.Router();

// Store job status (in-memory for MVP, use Redis in production)
const jobStatus = new Map();

// POST generate draft
router.post('/generate', verifyToken, async (req, res) => {
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

    const rfp = await RFPAnalysis.findByPk(rfpAnalysisId);
    if (!rfp) {
      return res.status(404).json({
        success: false,
        error: 'RFP Analysis not found'
      });
    }

    const jobId = uuidv4();
    jobStatus.set(jobId, {
      status: 'processing',
      progress: 10,
      orgId: org.id
    });

    // Start async draft generation
    processDraft(jobId, rfpAnalysisId, org.id, org).catch(error => {
      jobStatus.set(jobId, {
        status: 'error',
        error: error.message,
        orgId: org.id
      });
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
      error: error.message
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
      error: error.message
    });
  }
});

// Background job: Generate draft
async function processDraft(jobId, rfpAnalysisId, orgId, org) {
  try {
    jobStatus.set(jobId, {
      status: 'processing',
      progress: 20,
      orgId
    });

    const rfp = await RFPAnalysis.findByPk(rfpAnalysisId);

    if (!rfp) {
      throw new Error('RFP not found');
    }

    jobStatus.set(jobId, {
      status: 'processing',
      progress: 40,
      orgId
    });

    // Generate draft with Claude (use org profile + RFP context)
    logger.info({ jobId, orgId }, 'Generating draft with Claude...');
    const draft = await generateDraft({
      orgProfile: {
        name: org.name,
        mission: org.mission,
        track_record: org.track_record
      },
      rfpAnalysis: rfp.get({ plain: true })
    });

    jobStatus.set(jobId, {
      status: 'processing',
      progress: 80,
      orgId
    });

    // Store draft in database
    const draftRecord = await Draft.create({
      grant_id: rfp.grant_id,
      org_id: orgId,
      version: 1,
      problem_statement: draft.problem_statement || '',
      impact_statement: draft.impact_statement || '',
      budget_narrative: draft.budget_narrative || ''
    });

    jobStatus.set(jobId, {
      status: 'complete',
      progress: 100,
      orgId,
      draft: draftRecord.get({ plain: true })
    });

    logger.info({ jobId }, 'Draft generation complete');
  } catch (error) {
    logger.error({ jobId, error: error.message }, 'Error generating draft');
    jobStatus.set(jobId, {
      status: 'error',
      error: error.message,
      orgId
    });
  }
}

module.exports = router;
