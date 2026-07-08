const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Organization } = require('../models');
const { extractTextFromBase64, truncateForClaude } = require('../services/fileParserService');
const { parseBusinessPlan } = require('../services/claudeService');
const { safeError } = require('../utils/safeError');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// Business plan uploads trigger a Claude parse — same per-user cap as RFP uploads
const businessPlanRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many business plan uploads. Please wait before trying again.'
});

// Large body limit for the upload route only (base64 documents)
const largeJsonParser = express.json({ limit: '25mb' });

const BUSINESS_PLAN_SECTIONS = [
  'executive_summary', 'products_and_programs', 'market_analysis',
  'marketing_outreach', 'operations_plan', 'growth_strategy',
  'financial_projections', 'funding_strategy', 'risks_and_mitigation'
];

// GET org profile
router.get('/', verifyToken, async (req, res) => {
  try {
    const org = await Organization.findOne({
      where: { userId: req.user.userId }
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    res.json({
      success: true,
      data: org
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST questionnaire (create/update org profile)
router.post('/questionnaire', verifyToken, async (req, res) => {
  try {
    const {
      // Basics
      name, mission, vision, yearsInOperation,
      website, phone, address, ein, taxExemptStatus, nteeCode,
      // Problem & population
      problemStatement, targetPopulation, geographicScope, geographicServiceArea, annualClientsServed,
      // Programs & evidence
      programsAndServices, theoryOfChange, evidenceBase,
      // Track record & outcomes
      trackRecord, outcomesData, pastGrantsCount,
      // Team & governance
      teamSummary, keyStaff, boardComposition,
      // Financials
      annualBudget, financialStatus, revenueBreakdown, reservesMonths, auditCompleted,
      // Sustainability & strategy
      sustainabilityPlan, diversityEquityInclusion, previousGrantors,
      // Business plan (structured sections only — document upload has its own endpoint)
      businessPlan,
      // Other
      evaluationCapabilities, partnerships, constraints, questionnaire
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Organization name required'
      });
    }

    let org = await Organization.findOne({
      where: { userId: req.user.userId }
    });

    const updateFields = {
      name, mission, vision, yearsInOperation,
      website, phone, address, ein, taxExemptStatus, nteeCode,
      problemStatement, targetPopulation, geographicScope, geographicServiceArea, annualClientsServed,
      programsAndServices, theoryOfChange, evidenceBase,
      trackRecord, outcomesData, pastGrantsCount,
      teamSummary, keyStaff, boardComposition,
      annualBudget, financialStatus, revenueBreakdown, reservesMonths, auditCompleted,
      sustainabilityPlan, diversityEquityInclusion, previousGrantors,
      businessPlan,
      evaluationCapabilities, partnerships, constraints, questionnaire
    };
    // Strip undefined so partial saves don't overwrite existing values with null
    Object.keys(updateFields).forEach(k => updateFields[k] === undefined && delete updateFields[k]);

    if (org) {
      await org.update(updateFields);
    } else {
      org = await Organization.create({ userId: req.user.userId, ...updateFields });
    }

    res.json({
      success: true,
      data: org
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT org profile (partial update)
router.put('/', verifyToken, async (req, res) => {
  try {
    const org = await Organization.findOne({
      where: { userId: req.user.userId }
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    // HIGH-5: explicit allowlist prevents mass assignment of userId/id/org_id
    const {
      name, mission, vision, yearsInOperation,
      website, phone, address, ein, taxExemptStatus, nteeCode,
      problemStatement, targetPopulation, geographicScope, geographicServiceArea, annualClientsServed,
      programsAndServices, theoryOfChange, evidenceBase,
      trackRecord, outcomesData, pastGrantsCount,
      teamSummary, keyStaff, boardComposition,
      annualBudget, financialStatus, revenueBreakdown, reservesMonths, auditCompleted,
      sustainabilityPlan, diversityEquityInclusion, previousGrantors,
      // Business plan (structured sections only — document upload has its own endpoint)
      businessPlan,
      evaluationCapabilities, partnerships, constraints, questionnaire
    } = req.body;

    const updateFields = {
      name, mission, vision, yearsInOperation,
      website, phone, address, ein, taxExemptStatus, nteeCode,
      problemStatement, targetPopulation, geographicScope, geographicServiceArea, annualClientsServed,
      programsAndServices, theoryOfChange, evidenceBase,
      trackRecord, outcomesData, pastGrantsCount,
      teamSummary, keyStaff, boardComposition,
      annualBudget, financialStatus, revenueBreakdown, reservesMonths, auditCompleted,
      sustainabilityPlan, diversityEquityInclusion, previousGrantors,
      businessPlan,
      evaluationCapabilities, partnerships, constraints, questionnaire
    };
    Object.keys(updateFields).forEach(k => updateFields[k] === undefined && delete updateFields[k]);

    await org.update(updateFields);

    res.json({
      success: true,
      data: org
    });
  } catch (error) {
    const { safeError } = require('../utils/safeError');
    res.status(500).json({
      success: false,
      error: safeError(error)
    });
  }
});

// POST upload business plan document — extracts text, AI-parses it into the
// structured questionnaire fields, and stores both on the org profile.
// Accepts { file_data (base64), mime_type, file_name } OR { text } for paste-in.
router.post('/business-plan/upload', largeJsonParser, verifyToken, businessPlanRateLimit, async (req, res) => {
  try {
    const org = await Organization.findOne({ where: { userId: req.user.userId } });
    if (!org) {
      return res.status(404).json({ success: false, error: 'Organization not found. Complete the questionnaire first.' });
    }

    let { text, file_name, file_data, mime_type } = req.body;

    if (file_data && !text) {
      try {
        text = await extractTextFromBase64(file_data, mime_type, file_name);
      } catch (parseErr) {
        return res.status(422).json({
          success: false,
          error: `Could not extract text from file: ${parseErr.message}`
        });
      }
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Business plan content required. Upload a PDF, DOCX, or TXT file, or paste the text directly.'
      });
    }

    text = truncateForClaude(text);

    // AI-extract the structured sections so the questionnaire pre-fills
    const parsed = await parseBusinessPlan(text);

    // Merge: parsed non-empty sections win, hand-entered values survive where the parse came up empty
    const existing = org.businessPlan || {};
    const merged = { ...existing };
    for (const key of BUSINESS_PLAN_SECTIONS) {
      const value = parsed[key];
      if (typeof value === 'string' && value.trim()) merged[key] = value;
    }

    await org.update({
      businessPlan: merged,
      businessPlanText: text,
      businessPlanFileName: file_name || null,
      businessPlanUploadedAt: new Date()
    });

    res.json({
      success: true,
      data: {
        businessPlan: merged,
        businessPlanFileName: org.businessPlanFileName,
        businessPlanUploadedAt: org.businessPlanUploadedAt,
        extracted_chars: text.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// DELETE business plan — clears the uploaded document and structured sections
router.delete('/business-plan', verifyToken, async (req, res) => {
  try {
    const org = await Organization.findOne({ where: { userId: req.user.userId } });
    if (!org) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    await org.update({
      businessPlan: {},
      businessPlanText: null,
      businessPlanFileName: null,
      businessPlanUploadedAt: null
    });

    res.json({ success: true, data: { cleared: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

module.exports = router;
