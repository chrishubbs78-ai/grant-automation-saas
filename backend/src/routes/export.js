const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Organization, Grant, Draft, RFPAnalysis } = require('../models');
const { buildProposalDocx } = require('../services/exportService');
const logger = require('../utils/logger');
const router = express.Router();

// GET /api/export/grants/:grantId/docx — download a formatted Word proposal
router.get('/grants/:grantId/docx', verifyToken, async (req, res) => {
  try {
    const org = await Organization.findOne({ where: { userId: req.user.userId } });
    if (!org) return res.status(404).json({ success: false, error: 'Organization not found' });

    const grant = await Grant.findOne({
      where: { id: req.params.grantId, org_id: org.id }
    });
    if (!grant) return res.status(404).json({ success: false, error: 'Grant not found' });

    // Get the latest draft version
    const draft = await Draft.findOne({
      where: { grant_id: grant.id, org_id: org.id },
      order: [['version', 'DESC']]
    });

    if (!draft) {
      return res.status(404).json({
        success: false,
        error: 'No draft found for this grant. Generate a draft first.'
      });
    }

    const rfpAnalysis = await RFPAnalysis.findOne({ where: { grant_id: grant.id } });

    logger.info({ grantId: grant.id, orgId: org.id }, 'Exporting proposal as DOCX');

    const buffer = await buildProposalDocx({
      org: org.get({ plain: true }),
      grant: grant.get({ plain: true }),
      draft: draft.get({ plain: true }),
      rfpAnalysis: rfpAnalysis ? rfpAnalysis.get({ plain: true }) : null
    });

    const safeFunder = (grant.funder_name || 'Grant').replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '_');
    const safeOrg = org.name.replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '_');
    const filename = `${safeOrg}_Proposal_${safeFunder}.docx`;

    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.set('Content-Length', buffer.length);
    res.set('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (error) {
    logger.error({ error: error.message }, 'DOCX export failed');
    res.status(500).json({ success: false, error: `Export failed: ${error.message}` });
  }
});

module.exports = router;
