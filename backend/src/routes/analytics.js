const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Organization } = require('../models');
const { computeAnalytics } = require('../services/learningEngine');
const router = express.Router();

// GET analytics (computed from outcomes)
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

    // Compute analytics from outcomes (live computation)
    const analytics = await computeAnalytics(org.id);

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Analytics fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
