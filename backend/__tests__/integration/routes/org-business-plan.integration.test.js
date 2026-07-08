const request = require('supertest');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { Organization } = require('../../../src/models');
const { setupTestDatabase } = require('../setup');

const JWT_SECRET = process.env.JWT_SECRET;
const testUserId = uuidv4();
const testOrgId = uuidv4();

const generateToken = (userId) => jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });

const SAMPLE_PLAN_TEXT =
  'Business Plan for Test Organization. We provide after-school STEM programming to 500 youth annually. ' +
  'Our five-year plan expands to three new sites, funded by a mix of foundation grants and earned revenue. ' +
  'Financial projections show revenue growing from $1.2M to $2.5M by year three.';

describe('Org Business Plan Integration Tests', () => {
  let app;

  beforeAll(async () => {
    await setupTestDatabase();
    app = require('../../../src/app');
  });

  beforeEach(async () => {
    await Organization.truncate({ cascade: true });
    await Organization.create({
      id: testOrgId,
      userId: testUserId,
      name: 'Test Organization',
      mission: 'Testing missions'
    });
  });

  describe('POST /api/org/business-plan/upload', () => {
    test('Should accept pasted text, AI-parse it, and store structured sections', async () => {
      const token = generateToken(testUserId);

      const response = await request(app)
        .post('/api/org/business-plan/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: SAMPLE_PLAN_TEXT });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.businessPlan.executive_summary).toBeTruthy();
      expect(response.body.data.businessPlan.growth_strategy).toBeTruthy();
      expect(response.body.data.businessPlan.funding_strategy).toBeTruthy();
      expect(response.body.data.extracted_chars).toBe(SAMPLE_PLAN_TEXT.length);

      // Persisted on the org profile
      const org = await Organization.findByPk(testOrgId);
      expect(org.businessPlanText).toBe(SAMPLE_PLAN_TEXT);
      expect(org.businessPlan.executive_summary).toBeTruthy();
      expect(org.businessPlanUploadedAt).not.toBeNull();
    });

    test('Should accept a base64 TXT file and record the filename', async () => {
      const token = generateToken(testUserId);
      const base64 = Buffer.from(SAMPLE_PLAN_TEXT, 'utf8').toString('base64');

      const response = await request(app)
        .post('/api/org/business-plan/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ file_name: 'business-plan.txt', mime_type: 'text/plain', file_data: base64 });

      expect(response.status).toBe(200);
      expect(response.body.data.businessPlanFileName).toBe('business-plan.txt');

      const org = await Organization.findByPk(testOrgId);
      expect(org.businessPlanFileName).toBe('business-plan.txt');
      expect(org.businessPlanText).toBe(SAMPLE_PLAN_TEXT);
    });

    test('Should preserve hand-entered sections the parse leaves empty', async () => {
      const token = generateToken(testUserId);

      // Hand-enter a section key the mock parser never returns empty — instead
      // verify merge keeps pre-existing values for keys outside the parse result
      const org = await Organization.findByPk(testOrgId);
      await org.update({ businessPlan: { executive_summary: 'MANUAL SUMMARY', custom_note: 'keep me' } });

      const response = await request(app)
        .post('/api/org/business-plan/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: SAMPLE_PLAN_TEXT });

      expect(response.status).toBe(200);
      // Parsed value overwrites the manual summary (parse wins when non-empty)...
      expect(response.body.data.businessPlan.executive_summary).not.toBe('MANUAL SUMMARY');
      // ...but keys outside the known sections survive untouched
      expect(response.body.data.businessPlan.custom_note).toBe('keep me');
    });

    test('Should reject empty content with 400', async () => {
      const token = generateToken(testUserId);

      const response = await request(app)
        .post('/api/org/business-plan/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should return 404 when the user has no organization yet', async () => {
      const token = generateToken(uuidv4());

      const response = await request(app)
        .post('/api/org/business-plan/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: SAMPLE_PLAN_TEXT });

      expect(response.status).toBe(404);
    });

    test('Should require authentication', async () => {
      const response = await request(app)
        .post('/api/org/business-plan/upload')
        .send({ text: SAMPLE_PLAN_TEXT });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/org/business-plan', () => {
    test('Should clear the stored business plan', async () => {
      const token = generateToken(testUserId);

      await request(app)
        .post('/api/org/business-plan/upload')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: SAMPLE_PLAN_TEXT, file_name: 'plan.txt' });

      const response = await request(app)
        .delete('/api/org/business-plan')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      const org = await Organization.findByPk(testOrgId);
      expect(org.businessPlanText).toBeNull();
      expect(org.businessPlanFileName).toBeNull();
      expect(org.businessPlan).toEqual({});
    });
  });

  describe('Questionnaire round-trip with businessPlan', () => {
    test('POST /api/org/questionnaire should store structured business plan sections', async () => {
      const token = generateToken(testUserId);

      const businessPlan = {
        executive_summary: 'We grow programs sustainably.',
        growth_strategy: 'Open two new sites by 2028.',
        funding_strategy: 'Diversify to 40% earned revenue.'
      };

      const postResponse = await request(app)
        .post('/api/org/questionnaire')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Organization', businessPlan });

      expect(postResponse.status).toBe(200);
      expect(postResponse.body.data.businessPlan).toEqual(businessPlan);

      const getResponse = await request(app)
        .get('/api/org')
        .set('Authorization', `Bearer ${token}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.data.businessPlan).toEqual(businessPlan);
    });

    test('PUT /api/org should update business plan sections', async () => {
      const token = generateToken(testUserId);

      const response = await request(app)
        .put('/api/org')
        .set('Authorization', `Bearer ${token}`)
        .send({ businessPlan: { operations_plan: 'Lean team of 12 FTEs.' } });

      expect(response.status).toBe(200);
      expect(response.body.data.businessPlan.operations_plan).toBe('Lean team of 12 FTEs.');
    });
  });
});
