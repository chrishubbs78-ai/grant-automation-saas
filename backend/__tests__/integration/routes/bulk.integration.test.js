const request = require('supertest');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { sequelize, BulkJob, Grant, Organization } = require('../../../src/models');
const { setupTestDatabase } = require('../setup');

const JWT_SECRET = process.env.JWT_SECRET;
// Use random UUIDs to avoid conflicts in parallel test execution
const testUserId = uuidv4();
const testOrgId = uuidv4();

const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
};

describe('Bulk Operations Routes Integration Tests', () => {
  let app;
  // Use random UUIDs for "other org" to avoid FK constraint conflicts
  const otherUserId = uuidv4();
  const otherOrgId = uuidv4();

  beforeAll(async () => {
    await setupTestDatabase();
    app = require('../../../src/app');
  });

  beforeEach(async () => {
    await BulkJob.truncate({ cascade: true });
    await Grant.truncate({ cascade: true });
    await Organization.truncate({ cascade: true });

    await Organization.create({
      id: testOrgId,
      userId: testUserId,
      name: 'Test Organization'
    });
  });

  afterAll(async () => {
    // Don't close here; let cleanup handle it
  });

  describe('POST /api/bulk/update-status', () => {
    test('Should queue a bulk status update job', async () => {
      const token = generateToken(testUserId);

      // Create 3 grants
      const grants = [];
      for (let i = 0; i < 3; i++) {
        const grant = await Grant.create({
          org_id: testOrgId,
          funder_name: `Funder ${i}`,
          status: 'draft'
        });
        grants.push(grant.id);
      }

      const response = await request(app)
        .post('/api/bulk/update-status')
        .set('Authorization', `Bearer ${token}`)
        .send({
          grant_ids: grants,
          new_status: 'submitted'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(expect.objectContaining({
        operation_type: 'bulk_update_status',
        status: 'complete', // Synchronous processing
        total_items: 3,
        processed_items: 3
      }));

      // Verify grants were actually updated
      const updated = await Grant.findAll({ where: { id: grants } });
      expect(updated.every(g => g.status === 'submitted')).toBe(true);
    });

    test('Should reject invalid status', async () => {
      const token = generateToken(testUserId);
      const grant = await Grant.create({
        org_id: testOrgId,
        funder_name: 'Test',
        status: 'draft'
      });

      const response = await request(app)
        .post('/api/bulk/update-status')
        .set('Authorization', `Bearer ${token}`)
        .send({
          grant_ids: [grant.id],
          new_status: 'invalid_status'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid status');
    });

    test('Should reject non-empty grant_ids array', async () => {
      const token = generateToken(testUserId);

      const response = await request(app)
        .post('/api/bulk/update-status')
        .set('Authorization', `Bearer ${token}`)
        .send({
          grant_ids: [],
          new_status: 'submitted'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('non-empty array');
    });

    test('Should prevent updating grants from other orgs', async () => {
      const token = generateToken(testUserId);

      // Create other org first to satisfy FK constraint
      await Organization.create({
        id: otherOrgId,
        userId: otherUserId,
        name: 'Other Organization'
      });

      // Create grant in different org
      const otherGrant = await Grant.create({
        org_id: otherOrgId,
        funder_name: 'Other',
        status: 'draft'
      });

      const response = await request(app)
        .post('/api/bulk/update-status')
        .set('Authorization', `Bearer ${token}`)
        .send({
          grant_ids: [otherGrant.id],
          new_status: 'submitted'
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('organization');
    });

    test('Should require authentication', async () => {
      const response = await request(app)
        .post('/api/bulk/update-status')
        .send({
          grant_ids: ['grant-id'],
          new_status: 'submitted'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/bulk/export-csv', () => {
    test('Should queue a CSV export job', async () => {
      const token = generateToken(testUserId);

      // Create 2 grants
      for (let i = 0; i < 2; i++) {
        await Grant.create({
          org_id: testOrgId,
          funder_name: `Funder ${i}`,
          status: 'draft',
          amount: 50000 + (i * 10000)
        });
      }

      const response = await request(app)
        .post('/api/bulk/export-csv')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(expect.objectContaining({
        operation_type: 'bulk_export_csv',
        status: 'complete',
        total_items: 2,
        processed_items: 2
      }));

      expect(response.body.data.metadata).toEqual(expect.objectContaining({
        csv: expect.any(String)
      }));
    });

    test('Should filter CSV by status', async () => {
      const token = generateToken(testUserId);

      // Create 2 draft and 1 submitted
      for (let i = 0; i < 2; i++) {
        await Grant.create({
          org_id: testOrgId,
          funder_name: `Draft ${i}`,
          status: 'draft'
        });
      }
      await Grant.create({
        org_id: testOrgId,
        funder_name: 'Submitted',
        status: 'submitted'
      });

      const response = await request(app)
        .post('/api/bulk/export-csv')
        .set('Authorization', `Bearer ${token}`)
        .send({ filter_status: 'draft' });

      expect(response.status).toBe(200);
      expect(response.body.data.processed_items).toBe(2);
    });

    test('Should filter CSV by funder name', async () => {
      const token = generateToken(testUserId);

      await Grant.create({
        org_id: testOrgId,
        funder_name: 'NSF',
        status: 'draft'
      });
      await Grant.create({
        org_id: testOrgId,
        funder_name: 'NIH',
        status: 'draft'
      });

      const response = await request(app)
        .post('/api/bulk/export-csv')
        .set('Authorization', `Bearer ${token}`)
        .send({ filter_funder: 'NSF' });

      expect(response.status).toBe(200);
      expect(response.body.data.processed_items).toBe(1);
    });

    test('Should require authentication', async () => {
      const response = await request(app)
        .post('/api/bulk/export-csv')
        .send({});

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/bulk/import-rfps', () => {
    test('Should queue a bulk RFP import job', async () => {
      const token = generateToken(testUserId);

      const rfpEntries = [
        {
          funder_name: 'NSF',
          deadline: '2026-12-31',
          text: 'NSF RFP text...'
        },
        {
          funder_name: 'NIH',
          deadline: '2027-01-31',
          text: 'NIH RFP text...'
        }
      ];

      const response = await request(app)
        .post('/api/bulk/import-rfps')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfp_entries: rfpEntries });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(expect.objectContaining({
        operation_type: 'bulk_import_rfps',
        status: 'complete',
        total_items: 2,
        processed_items: 2
      }));

      // Verify grants were created
      const imports = await Grant.findAll({ where: { org_id: testOrgId } });
      expect(imports).toHaveLength(2);
      expect(imports[0].funder_name).toBe('NSF');
      expect(imports[1].funder_name).toBe('NIH');
    });

    test('Should reject empty rfp_entries', async () => {
      const token = generateToken(testUserId);

      const response = await request(app)
        .post('/api/bulk/import-rfps')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfp_entries: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('non-empty array');
    });

    test('Should require authentication', async () => {
      const response = await request(app)
        .post('/api/bulk/import-rfps')
        .send({
          rfp_entries: [{
            funder_name: 'NSF',
            text: 'RFP'
          }]
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/bulk/:jobId/download', () => {
    test('Should download CSV result for a completed export job', async () => {
      const token = generateToken(testUserId);

      await Grant.create({
        org_id: testOrgId,
        funder_name: 'CSV Funder',
        status: 'draft',
        amount: 75000
      });

      const exportResponse = await request(app)
        .post('/api/bulk/export-csv')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      const jobId = exportResponse.body.data.id;

      const response = await request(app)
        .get(`/api/bulk/${jobId}/download`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.text).toContain('CSV Funder');
    });

    test('Should return 404 for jobs without downloadable result', async () => {
      const token = generateToken(testUserId);

      const grant = await Grant.create({
        org_id: testOrgId,
        funder_name: 'Test',
        status: 'draft'
      });

      const updateResponse = await request(app)
        .post('/api/bulk/update-status')
        .set('Authorization', `Bearer ${token}`)
        .send({ grant_ids: [grant.id], new_status: 'submitted' });

      const response = await request(app)
        .get(`/api/bulk/${updateResponse.body.data.id}/download`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('No downloadable result');
    });

    test('Should not allow downloading other org\'s exports', async () => {
      const token = generateToken(testUserId);

      await Organization.create({
        id: otherOrgId,
        userId: otherUserId,
        name: 'Other Organization'
      });

      const otherJob = await BulkJob.create({
        org_id: otherOrgId,
        operation_type: 'bulk_export_csv',
        status: 'complete',
        metadata: { csv: 'id,funder_name\n1,Secret' }
      });

      const response = await request(app)
        .get(`/api/bulk/${otherJob.id}/download`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/bulk/:jobId', () => {
    test('Should poll bulk job status', async () => {
      const token = generateToken(testUserId);

      // Create a grant and queue update
      const grant = await Grant.create({
        org_id: testOrgId,
        funder_name: 'Test',
        status: 'draft'
      });

      const queueResponse = await request(app)
        .post('/api/bulk/update-status')
        .set('Authorization', `Bearer ${token}`)
        .send({
          grant_ids: [grant.id],
          new_status: 'submitted'
        });

      const jobId = queueResponse.body.data.id;

      // Poll job status
      const pollResponse = await request(app)
        .get(`/api/bulk/${jobId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(pollResponse.status).toBe(200);
      expect(pollResponse.body.success).toBe(true);
      expect(pollResponse.body.data).toEqual(expect.objectContaining({
        id: jobId,
        status: 'complete',
        processed_items: 1
      }));
    });

    test('Should return 404 for non-existent job', async () => {
      const token = generateToken(testUserId);

      const response = await request(app)
        .get(`/api/bulk/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    test('Should not allow polling other org\'s jobs', async () => {
      const token = generateToken(testUserId);

      // Create other org first to satisfy FK constraint
      await Organization.create({
        id: otherOrgId,
        userId: otherUserId,
        name: 'Other Organization'
      });

      // Create job for other org
      const otherJob = await BulkJob.create({
        org_id: otherOrgId,
        operation_type: 'bulk_update_status',
        status: 'complete'
      });

      const response = await request(app)
        .get(`/api/bulk/${otherJob.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    test('Should require authentication', async () => {
      const response = await request(app)
        .get(`/api/bulk/job-id`);

      expect(response.status).toBe(401);
    });
  });
});
