const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { verifyToken } = require('../middleware/auth');
const { Organization, FinancialDocument } = require('../models');
const logger = require('../utils/logger');
const router = express.Router();

const ALLOWED_TYPES = ['990', 'audit', 'budget', 'balance_sheet', 'irs_letter', 'board_list', 'other'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

async function getOrgOrFail(req, res) {
  const org = await Organization.findOne({ where: { userId: req.user.userId } });
  if (!org) {
    res.status(404).json({ success: false, error: 'Organization not found' });
    return null;
  }
  return org;
}

// GET list documents (metadata only — no file_data)
router.get('/', verifyToken, async (req, res) => {
  try {
    const org = await getOrgOrFail(req, res);
    if (!org) return;

    const docs = await FinancialDocument.findAll({
      where: { org_id: org.id },
      attributes: { exclude: ['file_data'] },
      order: [['fiscal_year', 'DESC'], ['created_at', 'DESC']]
    });

    res.json({ success: true, data: docs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST upload a document (base64 body upload — no multipart needed)
// Body: { document_type, file_name, mime_type, file_data (base64), fiscal_year, description }
router.post('/', verifyToken, async (req, res) => {
  try {
    const org = await getOrgOrFail(req, res);
    if (!org) return;

    const { document_type, file_name, mime_type, file_data, fiscal_year, description } = req.body;

    if (!document_type || !file_name || !file_data) {
      return res.status(400).json({
        success: false,
        error: 'document_type, file_name, and file_data (base64) are required'
      });
    }
    if (!ALLOWED_TYPES.includes(document_type)) {
      return res.status(400).json({
        success: false,
        error: `document_type must be one of: ${ALLOWED_TYPES.join(', ')}`
      });
    }

    const fileSizeBytes = Buffer.byteLength(file_data, 'base64');
    if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      return res.status(413).json({
        success: false,
        error: `File too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`
      });
    }

    const doc = await FinancialDocument.create({
      org_id: org.id,
      document_type,
      file_name: uuidv4() + '_' + file_name.replace(/[^a-zA-Z0-9._-]/g, '_'),
      original_name: file_name,
      mime_type: mime_type || 'application/octet-stream',
      file_data,
      file_size_bytes: fileSizeBytes,
      fiscal_year: fiscal_year ? parseInt(fiscal_year, 10) : null,
      description: description || '',
      is_sensitive: true
    });

    logger.info({ docId: doc.id, orgId: org.id, document_type }, 'Financial document uploaded');

    res.status(201).json({
      success: true,
      data: {
        id: doc.id,
        document_type: doc.document_type,
        original_name: doc.original_name,
        mime_type: doc.mime_type,
        file_size_bytes: doc.file_size_bytes,
        fiscal_year: doc.fiscal_year,
        description: doc.description,
        is_sensitive: doc.is_sensitive,
        created_at: doc.created_at
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET download a specific document (returns base64 file_data)
router.get('/:id/download', verifyToken, async (req, res) => {
  try {
    const org = await getOrgOrFail(req, res);
    if (!org) return;

    const doc = await FinancialDocument.findOne({
      where: { id: req.params.id, org_id: org.id }
    });

    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    logger.info({ docId: doc.id, orgId: org.id }, 'Financial document downloaded');

    // Decode and stream back as binary
    const buffer = Buffer.from(doc.file_data, 'base64');
    res.set('Content-Type', doc.mime_type || 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${doc.original_name || doc.file_name}"`);
    res.set('Content-Length', buffer.length);
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH update metadata (not file content)
router.patch('/:id', verifyToken, async (req, res) => {
  try {
    const org = await getOrgOrFail(req, res);
    if (!org) return;

    const doc = await FinancialDocument.findOne({
      where: { id: req.params.id, org_id: org.id }
    });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const { description, fiscal_year } = req.body;
    const updates = {};
    if (description !== undefined) updates.description = description;
    if (fiscal_year !== undefined) updates.fiscal_year = parseInt(fiscal_year, 10) || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'Nothing to update' });
    }

    await doc.update(updates);
    res.json({
      success: true,
      data: { id: doc.id, description: doc.description, fiscal_year: doc.fiscal_year }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE a document
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const org = await getOrgOrFail(req, res);
    if (!org) return;

    const doc = await FinancialDocument.findOne({
      where: { id: req.params.id, org_id: org.id }
    });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    await doc.destroy();
    logger.info({ docId: req.params.id, orgId: org.id }, 'Financial document deleted');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
