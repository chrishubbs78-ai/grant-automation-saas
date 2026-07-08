const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Grant, Organization, BulkJob } = require('../models');
const { bulkQueue } = require('../queues');
const { processUpdateStatus, processExportCSV, processImportRFPs } = require('../workers/bulkWorker');
const { safeError } = require('../utils/safeError');
const router = express.Router();

const MAX_BULK_ITEMS = 500;

// POST /api/bulk/update-status
router.post('/update-status', verifyToken, async (req, res) => {
  try {
    const { grant_ids, new_status } = req.body;

    if (!Array.isArray(grant_ids) || grant_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'grant_ids must be a non-empty array' });
    }
    if (grant_ids.length > MAX_BULK_ITEMS) {
      return res.status(400).json({ success: false, error: `Maximum ${MAX_BULK_ITEMS} grants per bulk operation` });
    }

    const validStatuses = ['draft', 'submitted', 'pending', 'funded', 'rejected'];
    if (!validStatuses.includes(new_status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const org = await Organization.findOne({ where: { userId: req.user.userId } });
    if (!org) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    const grants = await Grant.findAll({ where: { id: grant_ids, org_id: org.id } });
    if (grants.length !== grant_ids.length) {
      return res.status(403).json({ success: false, error: 'One or more grants do not belong to your organization' });
    }

    const bulkJob = await BulkJob.create({
      org_id: org.id,
      operation_type: 'bulk_update_status',
      status: 'queued',
      total_items: grant_ids.length,
      metadata: { grant_ids, new_status }
    });

    if (bulkQueue) {
      await bulkQueue.add('update-status', { jobId: bulkJob.id, orgId: org.id, userId: req.user.userId });
    } else {
      await processUpdateStatus(bulkJob, org, req.user.userId);
      await bulkJob.reload();
    }

    res.json({ success: true, data: bulkJob });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST /api/bulk/export-csv
router.post('/export-csv', verifyToken, async (req, res) => {
  try {
    const { filter_status, filter_funder } = req.body;

    const org = await Organization.findOne({ where: { userId: req.user.userId } });
    if (!org) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    const where = { org_id: org.id };
    if (filter_status) where.status = filter_status;
    if (filter_funder) where.funder_name = filter_funder;

    const grants = await Grant.findAll({ where });

    const bulkJob = await BulkJob.create({
      org_id: org.id,
      operation_type: 'bulk_export_csv',
      status: 'queued',
      total_items: grants.length,
      metadata: { filter_status, filter_funder }
    });

    if (bulkQueue) {
      await bulkQueue.add('export-csv', { jobId: bulkJob.id, orgId: org.id, userId: req.user.userId });
    } else {
      await processExportCSV(bulkJob, grants, req.user.userId);
      await bulkJob.reload();
    }

    res.json({ success: true, data: bulkJob });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// POST /api/bulk/import-rfps
router.post('/import-rfps', verifyToken, async (req, res) => {
  try {
    const { rfp_entries } = req.body;

    if (!Array.isArray(rfp_entries) || rfp_entries.length === 0) {
      return res.status(400).json({ success: false, error: 'rfp_entries must be a non-empty array' });
    }
    if (rfp_entries.length > MAX_BULK_ITEMS) {
      return res.status(400).json({ success: false, error: `Maximum ${MAX_BULK_ITEMS} entries per bulk operation` });
    }

    const org = await Organization.findOne({ where: { userId: req.user.userId } });
    if (!org) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    // MED-5: truncate raw text before storing in metadata to avoid excessive DB writes
    const sanitizedEntries = rfp_entries.map(e => ({
      ...e,
      text: typeof e.text === 'string' ? e.text.substring(0, 2000) : ''
    }));

    const bulkJob = await BulkJob.create({
      org_id: org.id,
      operation_type: 'bulk_import_rfps',
      status: 'queued',
      total_items: rfp_entries.length,
      metadata: { rfp_entries: sanitizedEntries }
    });

    if (bulkQueue) {
      await bulkQueue.add('import-rfps', { jobId: bulkJob.id, orgId: org.id, userId: req.user.userId });
    } else {
      await processImportRFPs(bulkJob, org, req.user.userId);
      await bulkJob.reload();
    }

    res.json({ success: true, data: bulkJob });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// GET /api/bulk/:jobId/download — download CSV export result
router.get('/:jobId/download', verifyToken, async (req, res) => {
  try {
    const bulkJob = await BulkJob.findOne({ where: { id: req.params.jobId } });
    if (!bulkJob) {
      return res.status(404).json({ success: false, error: 'Bulk job not found' });
    }

    const org = await Organization.findOne({ where: { userId: req.user.userId } });
    if (!org || bulkJob.org_id !== org.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    if (bulkJob.operation_type !== 'bulk_export_csv' || bulkJob.status !== 'complete' || !bulkJob.metadata?.csv) {
      return res.status(404).json({ success: false, error: 'No downloadable result for this job' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="grants_export_${bulkJob.id}.csv"`);
    res.send(bulkJob.metadata.csv);
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

// GET /api/bulk/:jobId — poll status
router.get('/:jobId', verifyToken, async (req, res) => {
  try {
    const bulkJob = await BulkJob.findOne({ where: { id: req.params.jobId } });
    if (!bulkJob) {
      return res.status(404).json({ success: false, error: 'Bulk job not found' });
    }

    const org = await Organization.findOne({ where: { userId: req.user.userId } });
    if (bulkJob.org_id !== org.id) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    res.json({ success: true, data: bulkJob });
  } catch (error) {
    res.status(500).json({ success: false, error: safeError(error) });
  }
});

module.exports = router;
