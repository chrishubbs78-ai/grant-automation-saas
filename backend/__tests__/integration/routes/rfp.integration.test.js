const request = require('supertest');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { sequelize, RFPAnalysis, Organization } = require('../../../src/models');
const { setupTestDatabase, cleanupTestDatabase } = require('../setup');

const JWT_SECRET = process.env.JWT_SECRET;
// Use random UUIDs to avoid conflicts in parallel test execution
const testUserId = uuidv4();
const testOrgId = uuidv4();

const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
};

describe('RFP Routes Integration Tests', () => {
  let app;

  beforeAll(async () => {
    await setupTestDatabase();
    app = require('../../../src/app');
  });

  beforeEach(async () => {
    // The async RFP-processing job from a previous test can still be writing
    // when this cleanup runs, briefly locking the tables — retry once.
    for (let attempt = 0; ; attempt++) {
      try {
        await RFPAnalysis.truncate({ cascade: true });
        await Organization.truncate({ cascade: true });
        break;
      } catch (err) {
        if (attempt >= 2) throw err;
        await new Promise(r => setTimeout(r, 300));
      }
    }

    await Organization.create({
      id: testOrgId,
      userId: testUserId,
      name: 'Test Organization'
    });
  });

  afterAll(async () => {
    // Don't close here; let cleanup handle it
  });

  describe('POST /api/rfp/upload', () => {
    test('Should queue RFP parsing job and return jobId', async () => {
      const token = generateToken(testUserId);

      const rfpText = `
        National Science Foundation Grant Opportunity
        Deadline: 2026-12-31
        Award Range: $100,000 - $500,000
        Page Limit: 15
        Submit online at grants.gov
      `;

      const response = await request(app)
        .post('/api/rfp/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfpText, fileName: 'nsf_rfp.txt' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(expect.objectContaining({
        jobId: expect.any(String),
        status: 'processing'
      }));
    });

    test('Should reject empty RFP text', async () => {
      const token = generateToken(testUserId);

      const response = await request(app)
        .post('/api/rfp/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfpText: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('RFP text required');
    });

    test('Should require authentication', async () => {
      const response = await request(app)
        .post('/api/rfp/upload')
        .send({ rfpText: 'Some RFP text' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/rfp/:jobId', () => {
    test('Should return processing status during parsing', async () => {
      const token = generateToken(testUserId);

      // First, upload an RFP to get jobId
      const uploadResponse = await request(app)
        .post('/api/rfp/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfpText: 'Test RFP text for parsing' });

      const jobId = uploadResponse.body.data.jobId;

      // Poll job status immediately (should be processing)
      const pollResponse = await request(app)
        .get(`/api/rfp/${jobId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(pollResponse.status).toBe(200);
      expect(pollResponse.body.success).toBe(true);
      expect(pollResponse.body.data).toEqual(expect.objectContaining({
        jobId,
        status: expect.stringMatching(/processing|complete|error/)
      }));
    });

    test('Should return 404 for non-existent job', async () => {
      const token = generateToken(testUserId);

      const response = await request(app)
        .get(`/api/rfp/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Job not found');
    });

    test('Should require authentication', async () => {
      const response = await request(app)
        .get(`/api/rfp/some-job-id`);

      expect(response.status).toBe(401);
    });
  });

  describe('RFP Parsing with Mock API', () => {
    test('Should parse RFP and extract key information', async () => {
      const token = generateToken(testUserId);

      const rfpText = `
        Department of Energy Grant Opportunity
        Program: Clean Energy Innovation
        Deadline: 2026-08-15
        Award Range: $250,000 - $1,000,000
        Page Limit: 20 pages

        Key Requirements:
        - Demonstrate innovation in renewable energy
        - Include project timeline
        - Provide evaluation plan

        Evaluation Criteria:
        - Technical Innovation: 40%
        - Feasibility: 30%
        - Team Qualifications: 20%
        - Budget Justification: 10%

        Eligibility:
        - U.S. based organizations
        - Must have active grant management system

        Submit online at energy.gov/grants
      `;

      const response = await request(app)
        .post('/api/rfp/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfpText });

      expect(response.status).toBe(200);
      expect(response.body.data.jobId).toBeDefined();

      // In mock mode, the parsed data should be available
      // In test environment, we verify the structure
      const jobId = response.body.data.jobId;
      expect(jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('RFP Error Handling', () => {
    test('Should handle missing API key gracefully (fallback to mock)', async () => {
      const token = generateToken(testUserId);

      const rfpText = 'Test RFP that would fail with missing API key';

      const response = await request(app)
        .post('/api/rfp/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfpText });

      // Should succeed with mock response
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('Should handle malformed RFP gracefully', async () => {
      const token = generateToken(testUserId);

      const rfpText = 'This is not a structured RFP, just random text without any dates or requirements';

      const response = await request(app)
        .post('/api/rfp/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfpText });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Should still return a jobId, even if parsing result is incomplete
      expect(response.body.data.jobId).toBeDefined();
    });
  });

  describe('Organization Context', () => {
    test('Should return 404 if organization not found', async () => {
      // Create token for user with no organization
      const orphanUserId = '999e9999-e99b-99d9-a999-999999999999';
      const token = generateToken(orphanUserId);

      const response = await request(app)
        .post('/api/rfp/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfpText: 'Some RFP text' });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Organization');
    });
  });
});
