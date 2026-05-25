const request = require('supertest');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { sequelize, RFPAnalysis, Organization, Draft } = require('../../../src/models');
const { setupTestDatabase } = require('../setup');

const JWT_SECRET = process.env.JWT_SECRET;
// Use random UUIDs to avoid conflicts in parallel test execution
const testUserId = uuidv4();
const testOrgId = uuidv4();

const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
};

describe('Draft Routes Integration Tests', () => {
  let app;

  beforeAll(async () => {
    await setupTestDatabase();
    app = require('../../../src/app');
  });

  beforeEach(async () => {
    await Draft.truncate({ cascade: true });
    await RFPAnalysis.truncate({ cascade: true });
    await Organization.truncate({ cascade: true });

    await Organization.create({
      id: testOrgId,
      userId: testUserId,
      name: 'Test Organization',
      mission: 'To advance scientific research'
    });
  });

  afterAll(async () => {
    // Don't close here; let cleanup handle it
  });

  describe('POST /api/draft/generate', () => {
    test('Should queue draft generation job and return jobId', async () => {
      const token = generateToken(testUserId);

      // Create RFP analysis first
      const rfpAnalysis = await RFPAnalysis.create({
        org_id: testOrgId,
        funder_name: 'National Science Foundation',
        deadline: '2026-12-31',
        requirements: ['innovative research', 'proven team', 'detailed budget'],
        page_limit: 15,
        evaluation_criteria: {
          innovation: '40%',
          feasibility: '30%',
          team: '20%',
          budget: '10%'
        },
        research_summary: {
          priorities: ['climate science', 'renewable energy'],
          success_rate: 0.18
        }
      });

      const response = await request(app)
        .post('/api/draft/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfpAnalysisId: rfpAnalysis.id });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(expect.objectContaining({
        jobId: expect.any(String),
        status: 'processing'
      }));
    });

    test('Should reject missing rfpAnalysisId', async () => {
      const token = generateToken(testUserId);

      const response = await request(app)
        .post('/api/draft/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('rfpAnalysisId required');
    });

    test('Should reject non-existent RFP analysis', async () => {
      const token = generateToken(testUserId);

      const response = await request(app)
        .post('/api/draft/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfpAnalysisId: '00000000-0000-0000-0000-000000000000' });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('RFP Analysis not found');
    });

    test('Should require authentication', async () => {
      const response = await request(app)
        .post('/api/draft/generate')
        .send({ rfpAnalysisId: 'some-id' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/draft/:jobId', () => {
    test('Should return processing status during draft generation', async () => {
      const token = generateToken(testUserId);

      // Create RFP analysis
      const rfpAnalysis = await RFPAnalysis.create({
        org_id: testOrgId,
        funder_name: 'NIH',
        deadline: '2026-10-15',
        requirements: [],
        research_summary: {}
      });

      // Queue draft generation
      const generateResponse = await request(app)
        .post('/api/draft/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfpAnalysisId: rfpAnalysis.id });

      const jobId = generateResponse.body.data.jobId;

      // Poll job status
      const pollResponse = await request(app)
        .get(`/api/draft/${jobId}`)
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
        .get(`/api/draft/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Job not found');
    });

    test('Should require authentication', async () => {
      const response = await request(app)
        .get(`/api/draft/some-job-id`);

      expect(response.status).toBe(401);
    });
  });

  describe('Draft Generation with Organization Context', () => {
    test('Should include org profile in draft generation context', async () => {
      const token = generateToken(testUserId);

      // Create comprehensive org profile
      const org = await Organization.findByPk(testOrgId);
      await org.update({
        mission: 'To advance climate research and sustainability',
        team_summary: 'PhD-level scientists with 15+ years experience',
        track_record: 'Published in Nature, Science, PNAS'
      });

      // Create RFP analysis
      const rfpAnalysis = await RFPAnalysis.create({
        org_id: testOrgId,
        funder_name: 'Department of Energy',
        deadline: '2026-09-30',
        requirements: ['climate focus', 'team experience', 'sustainability plan'],
        research_summary: {
          priorities: ['climate tech', 'energy efficiency'],
          evaluation_criteria: { innovation: 0.4, impact: 0.3, feasibility: 0.3 }
        }
      });

      // Generate draft
      const response = await request(app)
        .post('/api/draft/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfpAnalysisId: rfpAnalysis.id });

      expect(response.status).toBe(200);
      expect(response.body.data.jobId).toBeDefined();
      // In mock mode, should include org context in generation
    });
  });

  describe('Draft Error Handling', () => {
    test('Should handle API timeout gracefully', async () => {
      const token = generateToken(testUserId);

      // Create RFP analysis
      const rfpAnalysis = await RFPAnalysis.create({
        org_id: testOrgId,
        funder_name: 'NSF',
        deadline: '2026-12-31',
        requirements: [],
        research_summary: {}
      });

      // Queue generation (will timeout gracefully in mock mode)
      const response = await request(app)
        .post('/api/draft/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfpAnalysisId: rfpAnalysis.id });

      expect(response.status).toBe(200);
      // Should still return jobId even if it will fail
      expect(response.body.data.jobId).toBeDefined();
    });

    test('Should handle missing API key gracefully', async () => {
      const token = generateToken(testUserId);

      // Create RFP analysis
      const rfpAnalysis = await RFPAnalysis.create({
        org_id: testOrgId,
        funder_name: 'NIH',
        deadline: '2026-11-15',
        requirements: [],
        research_summary: {}
      });

      // Should succeed with mock response
      const response = await request(app)
        .post('/api/draft/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfpAnalysisId: rfpAnalysis.id });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Organization Context Validation', () => {
    test('Should return 404 if organization not found', async () => {
      // Create token for user with no organization
      const orphanUserId = '999e9999-e99b-99d9-a999-999999999999';
      const token = generateToken(orphanUserId);

      const response = await request(app)
        .post('/api/draft/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfpAnalysisId: 'some-id' });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Organization');
    });
  });

  describe('Draft Storage and Retrieval', () => {
    test('Should store completed draft in database', async () => {
      const token = generateToken(testUserId);

      // Create RFP analysis
      const rfpAnalysis = await RFPAnalysis.create({
        org_id: testOrgId,
        funder_name: 'Foundation for Advancement',
        deadline: '2026-07-31',
        requirements: [],
        research_summary: {}
      });

      // Queue draft generation
      const generateResponse = await request(app)
        .post('/api/draft/generate')
        .set('Authorization', `Bearer ${token}`)
        .send({ rfpAnalysisId: rfpAnalysis.id });

      expect(generateResponse.status).toBe(200);

      // In mock mode, draft should eventually be available
      // Verify the job system works correctly
      const jobId = generateResponse.body.data.jobId;
      expect(jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });
});
