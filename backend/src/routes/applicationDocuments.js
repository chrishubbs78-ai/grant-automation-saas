const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Organization, Grant, ApplicationDocument, FinancialDocument } = require('../models');
const { safeError } = require('../utils/safeError');
const router = express.Router();

// Uploads arrive as base64 and blow past the global 10kb JSON limit.
const largeJsonParser = express.json({ limit: '25mb' });

const MAX_FILE_BYTES = 15 * 1024 * 1024;

// Same allowlist discipline as the financials vault — never echo back a
// Content-Type the uploader chose freely.
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg'
];

const VALID_STATUSES = ['needed', 'attached', 'not_applicable'];

/** What most funders ask for. Seeded on a new application so the list starts useful. */
const STARTER_REQUIREMENTS = [
  { label: 'IRS determination letter', description: 'Proof of 501(c)(3) status', required: true },
  { label: 'Most recent IRS Form 990', description: 'Usually the prior fiscal year', required: true },
  { label: 'Audited financial statements', description: 'Or reviewed statements if unaudited', required: true },
  { label: 'Organizational budget', description: 'Current fiscal year, income and expense', required: true },
  { label: 'Project budget', description: 'Line-item budget specific to this request', required: true },
  { label: 'Board of directors list', description: 'With affiliations', required: true },
  { label: 'Letters of support', description: 'From partners named in the proposal', required: false },
  { label: 'W-9', description: 'Required by many funders before disbursement', required: false }
];

async function getOrg(req, res) {
  const org = await Organization.findOne({ where: { userId: req.user.userId } });
  if (!org) {
    res.status(404).json({ success: false, error: 'Organization not found' });
    return null;
  }
  return org;
}

/** Resolve a grant the caller actually owns. */
async function getOwnedGrant(grantId, orgId, res) {
  const grant = await Grant.findOne({ where: { id: grantId, org_id: orgId } });
  if (!grant) {
    res.status(404).json({ success: false, error: 'Application not found' });
    return null;
  }
  return grant;
}

// GET /api/grants/:grantId/documents — the checklist for one application
router.get('/:grantId/documents', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const grant = await getOwnedGrant(req.params.grantId, org.id, res);
    if (!grant) return;

    const docs = await ApplicationDocument.findAll({
      where: { grant_id: grant.id },
      // Never ship base64 payloads in a list response.
      attributes: { exclude: ['file_data'] },
      include: [{ association: 'vaultDocument', attributes: ['id', 'document_type', 'file_name'] }],
      order: [['required', 'DESC'], ['created_at', 'ASC']]
    });

    const required = docs.filter(d => d.required && d.status !== 'not_applicable');
    const attached = required.filter(d => d.status === 'attached');

    res.json({
      success: true,
      data: {
        documents: docs,
        progress: {
          required: required.length,
          attached: attached.length,
          complete: required.length > 0 && attached.length === required.length,
          missing: required.filter(d => d.status !== 'attached').map(d => d.label)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST /api/grants/:grantId/documents/seed — add the standard checklist
router.post('/:grantId/documents/seed', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const grant = await getOwnedGrant(req.params.grantId, org.id, res);
    if (!grant) return;

    const existing = await ApplicationDocument.findAll({
      where: { grant_id: grant.id },
      attributes: ['label']
    });
    const have = new Set(existing.map(d => d.label.toLowerCase()));

    const toCreate = STARTER_REQUIREMENTS
      .filter(r => !have.has(r.label.toLowerCase()))
      .map(r => ({ ...r, grant_id: grant.id, org_id: org.id, status: 'needed' }));

    const created = toCreate.length ? await ApplicationDocument.bulkCreate(toCreate) : [];
    res.status(201).json({ success: true, data: { added: created.length, skipped: STARTER_REQUIREMENTS.length - created.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST /api/grants/:grantId/documents — add one requirement
router.post('/:grantId/documents', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const grant = await getOwnedGrant(req.params.grantId, org.id, res);
    if (!grant) return;

    const { label, description, required, due_at, financial_document_id } = req.body || {};
    if (!label || !String(label).trim()) {
      return res.status(400).json({ success: false, error: 'A label is required' });
    }

    // Pointing at a vault document must not let you reference another org's file.
    if (financial_document_id) {
      const vaultDoc = await FinancialDocument.findOne({
        where: { id: financial_document_id, org_id: org.id }
      });
      if (!vaultDoc) {
        return res.status(404).json({ success: false, error: 'Vault document not found' });
      }
    }

    const doc = await ApplicationDocument.create({
      grant_id: grant.id,
      org_id: org.id,
      label: String(label).trim().substring(0, 255),
      description: description ? String(description).substring(0, 2000) : null,
      required: required !== false,
      due_at: due_at ? new Date(due_at) : null,
      financial_document_id: financial_document_id || null,
      status: financial_document_id ? 'attached' : 'needed'
    });

    res.status(201).json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST /api/grants/:grantId/documents/:docId/upload — attach a file
router.post('/:grantId/documents/:docId/upload', largeJsonParser, verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const grant = await getOwnedGrant(req.params.grantId, org.id, res);
    if (!grant) return;

    const doc = await ApplicationDocument.findOne({
      where: { id: req.params.docId, grant_id: grant.id }
    });
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });

    const { file_name, mime_type, file_data } = req.body || {};
    if (!file_data || !file_name) {
      return res.status(400).json({ success: false, error: 'file_name and file_data are required' });
    }
    if (!ALLOWED_MIME_TYPES.includes(mime_type)) {
      return res.status(415).json({
        success: false,
        error: `Unsupported file type. Accepted: PDF, Word, Excel, CSV, text, PNG, JPEG.`
      });
    }

    const sizeBytes = Buffer.byteLength(file_data, 'base64');
    if (sizeBytes > MAX_FILE_BYTES) {
      return res.status(413).json({
        success: false,
        error: `File is ${(sizeBytes / 1048576).toFixed(1)} MB — the limit is ${MAX_FILE_BYTES / 1048576} MB`
      });
    }

    await doc.update({
      file_name: String(file_name).substring(0, 255),
      mime_type,
      file_data,
      file_size_bytes: sizeBytes,
      status: 'attached',
      financial_document_id: null // an uploaded file supersedes a vault pointer
    });

    const { file_data: _omit, ...safe } = doc.get({ plain: true });
    res.json({ success: true, data: safe });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// GET /api/grants/:grantId/documents/:docId/download
router.get('/:grantId/documents/:docId/download', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const grant = await getOwnedGrant(req.params.grantId, org.id, res);
    if (!grant) return;

    const doc = await ApplicationDocument.findOne({
      where: { id: req.params.docId, grant_id: grant.id },
      include: [{ association: 'vaultDocument' }]
    });
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });

    // Resolve through to the vault file when this is a pointer rather than an upload.
    const payload = doc.file_data || (doc.vaultDocument && doc.vaultDocument.file_data);
    const name = doc.file_name || (doc.vaultDocument && doc.vaultDocument.file_name);
    const mime = doc.mime_type || (doc.vaultDocument && doc.vaultDocument.mime_type);

    if (!payload) {
      return res.status(404).json({ success: false, error: 'No file attached to this item yet' });
    }

    const safeMime = ALLOWED_MIME_TYPES.includes(mime) ? mime : 'application/octet-stream';
    const safeName = String(name || 'document').replace(/[^\w.\-]/g, '_').substring(0, 200);

    res.setHeader('Content-Type', safeMime);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.send(Buffer.from(payload, 'base64'));
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// PATCH /api/grants/:grantId/documents/:docId — status, notes, required flag
router.patch('/:grantId/documents/:docId', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const grant = await getOwnedGrant(req.params.grantId, org.id, res);
    if (!grant) return;

    const doc = await ApplicationDocument.findOne({
      where: { id: req.params.docId, grant_id: grant.id }
    });
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });

    const updates = {};
    if (req.body.status) {
      if (!VALID_STATUSES.includes(req.body.status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`
        });
      }
      // Don't let an item be marked attached with nothing behind it.
      if (req.body.status === 'attached' && !doc.file_data && !doc.financial_document_id) {
        return res.status(400).json({
          success: false,
          error: 'Attach a file or link a vault document before marking this attached'
        });
      }
      updates.status = req.body.status;
    }
    if (typeof req.body.required === 'boolean') updates.required = req.body.required;
    if (typeof req.body.notes === 'string') updates.notes = req.body.notes.substring(0, 2000);
    if (typeof req.body.label === 'string' && req.body.label.trim()) {
      updates.label = req.body.label.trim().substring(0, 255);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'Nothing to update' });
    }

    await doc.update(updates);
    const { file_data: _omit, ...safe } = doc.get({ plain: true });
    res.json({ success: true, data: safe });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// DELETE /api/grants/:grantId/documents/:docId
router.delete('/:grantId/documents/:docId', verifyToken, async (req, res) => {
  try {
    const org = await getOrg(req, res);
    if (!org) return;
    const grant = await getOwnedGrant(req.params.grantId, org.id, res);
    if (!grant) return;

    const deleted = await ApplicationDocument.destroy({
      where: { id: req.params.docId, grant_id: grant.id }
    });
    if (!deleted) return res.status(404).json({ success: false, error: 'Document not found' });

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

module.exports = router;
module.exports.STARTER_REQUIREMENTS = STARTER_REQUIREMENTS;
