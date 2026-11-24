const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyToken } = require('../middleware/auth');
const { Organization } = require('../models');
const builder = require('../services/businessPlanBuilder');
const { buildSectionsDocx } = require('../services/exportService');
const { safeError } = require('../utils/safeError');
const logger = require('../utils/logger');
const router = express.Router();

// Research and writing call Claude (research also runs web searches).
const aiRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  keyGenerator: (req) => req.user?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: 'Too many business plan AI requests. Please wait before trying again.'
});

// Answers can be long; allow more than the 10kb default.
const answersParser = express.json({ limit: '200kb' });

async function getOrg(req, res) {
  const org = await Organization.findOne({ where: { userId: req.user.userId } });
  if (!org) {
    res.status(404).json({ success: false, error: 'Organization not found. Complete your profile first.' });
    return null;
  }
  return org;
}

function state(org) {
  const b = org.businessPlanBuilder || {};
  const answers = b.answers || {};
  return {
    sections: builder.SECTIONS,
    answers,
    research: b.research || {},
    written: org.businessPlan || {},
    writing_notes: b.writing_notes || {},
    last_review: b.last_review || null,
    progress: builder.completeness(answers),
    quick_recommendations: builder.quickRecommendations(org, answers),
    drive_link: b.drive_link || null
  };
}

function validSection(req, res) {
  if (!builder.SECTION_KEYS.includes(req.params.section)) {
    res.status(400).json({ success: false, error: `Unknown section. Use one of: ${builder.SECTION_KEYS.join(', ')}` });
    return false;
  }
  return true;
}

// GET /api/business-plan — questions, answers, progress, recommendations
router.get('/', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    res.json({ success: true, data: state(org) });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// PUT /api/business-plan/answers — save answers (merges; send '' to clear one)
router.put('/answers', answersParser, verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const incoming = builder.sanitizeAnswers((req.body && req.body.answers) || {});
    const b = org.businessPlanBuilder || {};
    const answers = { ...(b.answers || {}), ...incoming };
    for (const [k, v] of Object.entries(answers)) if (v === '') delete answers[k];
    await org.update({ businessPlanBuilder: { ...b, answers } });
    res.json({ success: true, data: state(org) });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST /api/business-plan/review — Claude reviews the plan as funder and lender
router.post('/review', verifyToken, aiRateLimit, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const review = await builder.reviewPlan(org);
    const b = org.businessPlanBuilder || {};
    await org.update({ businessPlanBuilder: { ...b, last_review: { ...review, reviewed_at: new Date().toISOString() } } });
    res.json({ success: true, data: state(org) });
  } catch (error) {
    logger.error({ error: error.message }, 'Business plan review failed');
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST /api/business-plan/sections/:section/research — web research for a section
router.post('/sections/:section/research', verifyToken, aiRateLimit, async (req, res) => {
  try {
    if (!validSection(req, res)) return;
    const org = await getOrg(req, res);
    if (!org) return;
    const research = await builder.researchSection(org, req.params.section);
    const b = org.businessPlanBuilder || {};
    await org.update({
      businessPlanBuilder: {
        ...b,
        research: { ...(b.research || {}), [req.params.section]: { ...research, researched_at: new Date().toISOString() } }
      }
    });
    res.json({ success: true, data: state(org) });
  } catch (error) {
    logger.error({ error: error.message }, 'Business plan research failed');
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST /api/business-plan/sections/:section/write — write one section
router.post('/sections/:section/write', verifyToken, aiRateLimit, async (req, res) => {
  try {
    if (!validSection(req, res)) return;
    const org = await getOrg(req, res);
    if (!org) return;
    const result = await builder.writeSection(org, req.params.section);
    const b = org.businessPlanBuilder || {};
    await org.update({
      businessPlan: { ...(org.businessPlan || {}), [req.params.section]: result.text },
      businessPlanBuilder: {
        ...b,
        writing_notes: {
          ...(b.writing_notes || {}),
          [req.params.section]: { assumptions: result.assumptions || [], still_needed: result.still_needed || [], written_at: new Date().toISOString() }
        }
      }
    });
    res.json({ success: true, data: state(org) });
  } catch (error) {
    logger.error({ error: error.message }, 'Business plan section writing failed');
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// PUT /api/business-plan/sections/:section — save the owner's own edits
router.put('/sections/:section', answersParser, verifyToken, async (req, res) => {
  try {
    if (!validSection(req, res)) return;
    const org = await getOrg(req, res);
    if (!org) return;
    const text = typeof req.body.text === 'string' ? req.body.text.slice(0, 20000) : null;
    if (text === null) return res.status(400).json({ success: false, error: 'text is required' });
    await org.update({ businessPlan: { ...(org.businessPlan || {}), [req.params.section]: text } });
    res.json({ success: true, data: state(org) });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

function planSections(org) {
  const plan = org.businessPlan || {};
  return builder.SECTIONS.map(s => ({ heading: s.title, body: plan[s.key] })).filter(s => s.body);
}

// GET /api/business-plan/export.docx — the whole plan as a Word document
router.get('/export.docx', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const sections = planSections(org);
    if (!sections.length) return res.status(400).json({ success: false, error: 'No sections written yet' });
    const buffer = await buildSectionsDocx({ title: `${org.name} Business Plan`, subtitle: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), sections });
    const safe = org.name.replace(/[^a-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '_') || 'Business';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}_Business_Plan.docx"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST /api/business-plan/drive — save the plan to Google Drive as a Google Doc
router.post('/drive', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const google = require('../services/googleService');
    const conn = google.isConfigured() ? await google.getConnection(org.id) : null;
    if (!conn) return res.status(409).json({ success: false, error: 'Connect Google first' });
    const sections = planSections(org);
    if (!sections.length) return res.status(400).json({ success: false, error: 'No sections written yet' });
    const file = await require('../services/googleSync').saveBusinessPlanToDrive(conn, org, sections);
    res.json({ success: true, data: file });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

module.exports = router;
