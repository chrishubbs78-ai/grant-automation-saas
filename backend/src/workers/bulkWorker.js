const { bulkQueue } = require('../queues');
const { BulkJob, Grant, Organization } = require('../models');
const { Parser } = require('json2csv');
const { emitToUser } = require('../services/socketService');
const logger = require('../utils/logger');

function emitProgress(userId, jobId, status, processed, total) {
  emitToUser(userId, 'bulk:progress', { jobId, status, processed, total });
}

async function processUpdateStatus(bulkJob, org, userId) {
  try {
    const { grant_ids, new_status } = bulkJob.metadata;

    for (let i = 0; i < grant_ids.length; i++) {
      await Grant.update(
        { status: new_status },
        { where: { id: grant_ids[i], org_id: org.id } }
      );
      bulkJob.processed_items = i + 1;
      await bulkJob.save();
      if (userId) emitProgress(userId, bulkJob.id, 'processing', i + 1, grant_ids.length);
    }

    bulkJob.status = 'complete';
    await bulkJob.save();
    if (userId) emitProgress(userId, bulkJob.id, 'complete', grant_ids.length, grant_ids.length);
  } catch (error) {
    bulkJob.status = 'error';
    bulkJob.error_message = error.message;
    await bulkJob.save();
    if (userId) emitProgress(userId, bulkJob.id, 'error', bulkJob.processed_items, bulkJob.total_items);
  }
}

async function processExportCSV(bulkJob, grants, userId) {
  try {
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

    bulkJob.result_url = `/api/bulk/${bulkJob.id}/download`;
    bulkJob.status = 'complete';
    bulkJob.processed_items = grants.length;
    bulkJob.metadata = { ...bulkJob.metadata, csv };
    await bulkJob.save();
    if (userId) emitProgress(userId, bulkJob.id, 'complete', grants.length, grants.length);
  } catch (error) {
    bulkJob.status = 'error';
    bulkJob.error_message = error.message;
    await bulkJob.save();
    if (userId) emitProgress(userId, bulkJob.id, 'error', 0, 0);
  }
}

async function processImportRFPs(bulkJob, org, userId) {
  try {
    const { rfp_entries } = bulkJob.metadata;

    for (let i = 0; i < rfp_entries.length; i++) {
      const { funder_name, deadline, text } = rfp_entries[i];
      await Grant.create({
        org_id: org.id,
        funder_name,
        deadline,
        status: 'draft',
        notes: `Imported from bulk RFP import. Original RFP text:\n\n${(text || '').substring(0, 500)}...`
      });
      bulkJob.processed_items = i + 1;
      await bulkJob.save();
      if (userId) emitProgress(userId, bulkJob.id, 'processing', i + 1, rfp_entries.length);
    }

    bulkJob.status = 'complete';
    await bulkJob.save();
    if (userId) emitProgress(userId, bulkJob.id, 'complete', rfp_entries.length, rfp_entries.length);
  } catch (error) {
    bulkJob.status = 'error';
    bulkJob.error_message = error.message;
    await bulkJob.save();
    if (userId) emitProgress(userId, bulkJob.id, 'error', bulkJob.processed_items, bulkJob.total_items);
  }
}

// Register Bull processors when Redis is available
if (bulkQueue) {
  bulkQueue.process('update-status', async (job) => {
    const { jobId, orgId, userId } = job.data;
    const [bulkJob, org] = await Promise.all([BulkJob.findByPk(jobId), Organization.findByPk(orgId)]);
    if (bulkJob && org) await processUpdateStatus(bulkJob, org, userId);
  });

  bulkQueue.process('export-csv', async (job) => {
    const { jobId, orgId, userId } = job.data;
    const [bulkJob, org] = await Promise.all([BulkJob.findByPk(jobId), Organization.findByPk(orgId)]);
    if (!bulkJob || !org) return;
    const where = { org_id: org.id };
    if (bulkJob.metadata.filter_status) where.status = bulkJob.metadata.filter_status;
    if (bulkJob.metadata.filter_funder) where.funder_name = bulkJob.metadata.filter_funder;
    const grants = await Grant.findAll({ where });
    await processExportCSV(bulkJob, grants, userId);
  });

  bulkQueue.process('import-rfps', async (job) => {
    const { jobId, orgId, userId } = job.data;
    const [bulkJob, org] = await Promise.all([BulkJob.findByPk(jobId), Organization.findByPk(orgId)]);
    if (bulkJob && org) await processImportRFPs(bulkJob, org, userId);
  });

  logger.info('Bulk job queue processors registered');
}

module.exports = { processUpdateStatus, processExportCSV, processImportRFPs };
