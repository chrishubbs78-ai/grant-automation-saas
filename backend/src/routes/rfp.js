const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { verifyToken } = require('../middleware/auth');
const { Organization, Grant, RFPAnalysis } = require('../models');
const { parseRFP } = require('../services/claudeService');
const { researchFunder } = require('../services/geminiService');
const { extractTextFromBase64, truncateForClaude } = require('../services/fileParserService');
const logger = require('../utils/logger');
const router = express.Router();

// Store job status (in-memory for MVP, use Redis in production)
const jobStatus = new Map();

// Large body limit for this route only (file uploads can be ~10–20 MB as base64)
const largeJsonParser = express.json({ limit: '25mb' });

// POST upload RFP — accepts { rfpText } for plain text OR { fileData, mimeType, fileName } for binary files
router.post('/upload', largeJsonParser, verifyToken, async (req, res) => {
  try {
    let { rfpText, fileName, fileData, mimeType } = req.body;

    // If file data was sent as base64, extract text from it
    if (fileData && !rfpText) {
      try {
        rfpText = await extractTextFromBase64(fileData, mimeType, fileName);
        rfpText = truncateForClaude(rfpText);
      } catch (parseErr) {
        return res.status(422).json({
          success: false,
          error: `Could not extract text from file: ${parseErr.message}`
        });
      }
    }

    if (!rfpText || rfpText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'RFP text required. Upload a PDF, DOCX, or TXT file, or paste the text directly.'
      });
    }

    const org = await Organization.findOne({
      where: { userId: req.user.userId }
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    const jobId = uuidv4();
    jobStatus.set(jobId, {
      status: 'processing',
      progress: 10,
      orgId: org.id
    });

    // Start async processing
    processRFP(jobId, rfpText, org.id).catch(error => {
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
        message: 'RFP analysis in progress. Check status with this jobId.'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET RFP analysis result
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
          rfpAnalysis: job.rfpAnalysis,
          research: job.research
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

// Background job: Process RFP (parse + research)
async function processRFP(jobId, rfpText, orgId) {
  try {
    jobStatus.set(jobId, {
      status: 'processing',
      progress: 20,
      orgId
    });

    // Step 1: Parse RFP with Claude
    logger.info({ jobId, orgId }, 'Parsing RFP with Claude...');
    const rfpAnalysis = await parseRFP(rfpText);

    jobStatus.set(jobId, {
      status: 'processing',
      progress: 50,
      orgId
    });

    // Step 2: Research funder with Gemini
    logger.info({ jobId, funder: rfpAnalysis.funder_name }, 'Researching funder with Gemini...');
    let research = {};
    if (rfpAnalysis.funder_name && !rfpAnalysis.error) {
      try {
        research = await researchFunder(
          rfpAnalysis.funder_name,
          rfpAnalysis.key_requirements || []
        );
      } catch (error) {
        logger.warn({ jobId, error: error.message }, 'Funder research failed, continuing');
        research = { error: 'Research unavailable' };
      }
    }

    jobStatus.set(jobId, {
      status: 'processing',
      progress: 80,
      orgId
    });

    // Step 3: Store in database
    const grant = await Grant.create({
      org_id: orgId,
      funder_name: rfpAnalysis.funder_name || 'Unknown Funder',
      deadline: rfpAnalysis.deadline || null,
      amount: rfpAnalysis.award_range?.max || null,
      status: 'draft',
      rfp_analysis: rfpAnalysis
    });

    await RFPAnalysis.create({
      grant_id: grant.id,
      org_id: orgId,
      raw_text: rfpText.substring(0, 5000),
      funder_name: rfpAnalysis.funder_name || 'Unknown',
      deadline: rfpAnalysis.deadline || null,
      requirements: rfpAnalysis.key_requirements || [],
      page_limit: rfpAnalysis.page_limit || null,
      evaluation_criteria: rfpAnalysis.evaluation_criteria || {},
      research_summary: research
    });

    jobStatus.set(jobId, {
      status: 'complete',
      progress: 100,
      orgId,
      rfpAnalysis,
      research,
      grantId: grant.id
    });

    logger.info({ jobId, grantId: grant.id }, 'RFP analysis complete');
  } catch (error) {
    logger.error({ jobId, error: error.message }, 'Error processing RFP');
    jobStatus.set(jobId, {
      status: 'error',
      error: error.message,
      orgId
    });
  }
}

module.exports = router;
