const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { Grant, Organization, BulkJob } = require('../models');
const router = express.Router();
const { Parser } = require('json2csv');

// POST /api/bulk/update-status
// Queue a bulk status update for multiple grants
router.post('/update-status', verifyToken, async (req, res) => {
  try {
    const { grant_ids, new_status } = req.body;

    // Validate input
    if (!Array.isArray(grant_ids) || grant_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'grant_ids must be a non-empty array'
      });
    }

    const validStatuses = ['draft', 'submitted', 'pending', 'funded', 'rejected'];
    if (!validStatuses.includes(new_status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Get user's organization
    const org = await Organization.findOne({
      where: { userId: req.user.userId }
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    // Verify ownership of all grants
    const grants = await Grant.findAll({
      where: { id: grant_ids, org_id: org.id }
    });

    if (grants.length !== grant_ids.length) {
      return res.status(403).json({
        success: false,
        error: 'One or more grants do not belong to your organization'
      });
    }

    // Create bulk job record
    const bulkJob = await BulkJob.create({
      org_id: org.id,
      operation_type: 'bulk_update_status',
      status: 'queued',
      total_items: grant_ids.length,
      metadata: {
        grant_ids,
        new_status
      }
    });

    // TODO: Queue async job processor here (would use Bull queue in production)
    // For now, process synchronously for MVP
    await processUpdateStatus(bulkJob, org);

    res.json({
      success: true,
      data: bulkJob
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/bulk/export-csv
// Queue a CSV export of grants
router.post('/export-csv', verifyToken, async (req, res) => {
  try {
    const { filter_status, filter_funder } = req.body;

    const org = await Organization.findOne({
      where: { userId: req.user.userId }
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    // Build query
    const where = { org_id: org.id };
    if (filter_status) where.status = filter_status;
    if (filter_funder) where.funder_name = filter_funder;

    // Get matching grants first to set total_items
    const grants = await Grant.findAll({ where });

    // Create bulk job
    const bulkJob = await BulkJob.create({
      org_id: org.id,
      operation_type: 'bulk_export_csv',
      status: 'processing',
      total_items: grants.length,
      metadata: {
        filter_status,
        filter_funder
      }
    });

    // TODO: Queue async job here
    await processExportCSV(bulkJob, grants);

    res.json({
      success: true,
      data: bulkJob
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/bulk/import-rfps
// Queue bulk RFP import (multiple RFP texts or files)
router.post('/import-rfps', verifyToken, async (req, res) => {
  try {
    const { rfp_entries } = req.body; // Array of {funder_name, deadline, text}

    if (!Array.isArray(rfp_entries) || rfp_entries.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'rfp_entries must be a non-empty array'
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

    // Create bulk job
    const bulkJob = await BulkJob.create({
      org_id: org.id,
      operation_type: 'bulk_import_rfps',
      status: 'queued',
      total_items: rfp_entries.length,
      metadata: {
        rfp_entries
      }
    });

    // TODO: Queue async job here
    await processImportRFPs(bulkJob, org);

    res.json({
      success: true,
      data: bulkJob
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/bulk/:jobId
// Poll bulk job status
router.get('/:jobId', verifyToken, async (req, res) => {
  try {
    const bulkJob = await BulkJob.findOne({
      where: { id: req.params.jobId }
    });

    if (!bulkJob) {
      return res.status(404).json({
        success: false,
        error: 'Bulk job not found'
      });
    }

    // Verify ownership
    const org = await Organization.findOne({
      where: { userId: req.user.userId }
    });

    if (bulkJob.org_id !== org.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    res.json({
      success: true,
      data: bulkJob
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// ASYNC PROCESSORS (would be in Bull queue jobs)
// ============================================

async function processUpdateStatus(bulkJob, org) {
  try {
    const { grant_ids, new_status } = bulkJob.metadata;

    for (let i = 0; i < grant_ids.length; i++) {
      await Grant.update(
        { status: new_status },
        { where: { id: grant_ids[i], org_id: org.id } }
      );

      bulkJob.processed_items = i + 1;
      await bulkJob.save();
    }

    bulkJob.status = 'complete';
    await bulkJob.save();
  } catch (error) {
    bulkJob.status = 'error';
    bulkJob.error_message = error.message;
    await bulkJob.save();
  }
}

async function processExportCSV(bulkJob, grants) {
  try {
    // Convert grants to CSV format
    const fields = ['id', 'funder_name', 'deadline', 'amount', 'status', 'created_at'];
    const data = grants.map(g => ({
      id: g.id,
      funder_name: g.funder_name,
      deadline: g.deadline,
      amount: g.amount,
      status: g.status,
      created_at: g.created_at
    }));

    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    // In production: upload to S3 or similar, store URL
    bulkJob.result_url = `/api/bulk/${bulkJob.id}/download`;
    bulkJob.status = 'complete';
    bulkJob.processed_items = grants.length;
    bulkJob.metadata = { ...bulkJob.metadata, csv };
    await bulkJob.save();
  } catch (error) {
    bulkJob.status = 'error';
    bulkJob.error_message = error.message;
    await bulkJob.save();
  }
}

async function processImportRFPs(bulkJob, org) {
  try {
    const { rfp_entries } = bulkJob.metadata;

    for (let i = 0; i < rfp_entries.length; i++) {
      const { funder_name, deadline, text } = rfp_entries[i];

      // Create grant from RFP
      await Grant.create({
        org_id: org.id,
        funder_name,
        deadline,
        status: 'draft',
        notes: `Imported from bulk RFP import. Original RFP text:\n\n${text.substring(0, 500)}...`
      });

      bulkJob.processed_items = i + 1;
      await bulkJob.save();
    }

    bulkJob.status = 'complete';
    await bulkJob.save();
  } catch (error) {
    bulkJob.status = 'error';
    bulkJob.error_message = error.message;
    await bulkJob.save();
  }
}

module.exports = router;
