const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Organization } = require('../models');
const router = express.Router();

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

module.exports = router;
