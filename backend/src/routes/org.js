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
      name,
      mission,
      vision,
      problemStatement,
      targetPopulation,
      yearsInOperation,
      teamSummary,
      trackRecord,
      pastGrantsCount,
      annualBudget,
      financialStatus,
      evaluationCapabilities,
      partnerships,
      constraints,
      questionnaire
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

    if (org) {
      // Update existing
      await org.update({
        name,
        mission,
        vision,
        problemStatement,
        targetPopulation,
        yearsInOperation,
        teamSummary,
        trackRecord,
        pastGrantsCount,
        annualBudget,
        financialStatus,
        evaluationCapabilities,
        partnerships,
        constraints,
        questionnaire
      });
    } else {
      // Create new
      org = await Organization.create({
        userId: req.user.userId,
        name,
        mission,
        vision,
        problemStatement,
        targetPopulation,
        yearsInOperation,
        teamSummary,
        trackRecord,
        pastGrantsCount,
        annualBudget,
        financialStatus,
        evaluationCapabilities,
        partnerships,
        constraints,
        questionnaire
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

    await org.update(req.body);

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

module.exports = router;
