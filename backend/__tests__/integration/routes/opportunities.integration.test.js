const request = require('supertest');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const {
  Organization,
  GrantOpportunity,
  OpportunityMatch,
  Grant,
  RFPAnalysis
} = require('../../../src/models');
const { setupTestDatabase } = require('../setup');

const JWT_SECRET = process.env.JWT_SECRET;
const testUserId = uuidv4();
const testOrgId = uuidv4();

const generateToken = (userId) => jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });

describe('Opportunity Discovery Integration Tests', () => {
  let app;

  beforeAll(async () => {
    await setupTestDatabase();
    app = require('../../../src/app');
  });

  beforeEach(async () => {
    await OpportunityMatch.destroy({ where: {} });
    await RFPAnalysis.destroy({ where: {} });
    await Grant.destroy({ where: {} });
    await GrantOpportunity.destroy({ where: {} });
    await Organization.destroy({ where: {} });

    await Organization.create({
      id: testOrgId,
      userId: testUserId,
      name: 'Southside Youth Futures',
      mission: 'We help low-income youth succeed through STEM mentoring and education.',
      targetPopulation: 'low-income youth ages 8-14',
      annualBudget: 1200000,
      taxExemptStatus: '501c3'
    });
  });

  describe('POST /api/opportunities/discover', () => {
    test('Discovers, prefilters, and scores opportunities', async () => {
      const token = generateToken(testUserId);

      const response = await request(app)
        .post('/api/opportunities/discover')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.discovered).toBeGreaterThan(0);
      expect(response.body.data.scored).toBeGreaterThan(0);

      const stored = await GrantOpportunity.count();
      expect(stored).toBeGreaterThan(0);
    });

    test('Filters out opportunities closing inside the minimum lead time', async () => {
      const token = generateToken(testUserId);

      await request(app)
        .post('/api/opportunities/discover')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      // The mock catalog includes one opportunity closing in 3 days.
      const dismissed = await OpportunityMatch.findAll({
        where: { org_id: testOrgId, status: 'dismissed' }
      });
      expect(dismissed.length).toBeGreaterThan(0);
      expect(dismissed[0].rationale).toMatch(/days until close|Deadline has passed/);
    });

    test('Repeated runs update rather than duplicate opportunities', async () => {
      const token = generateToken(testUserId);

      await request(app).post('/api/opportunities/discover')
        .set('Authorization', `Bearer ${token}`).send({});
      const afterFirst = await GrantOpportunity.count();

      await request(app).post('/api/opportunities/discover')
        .set('Authorization', `Bearer ${token}`).send({});
      const afterSecond = await GrantOpportunity.count();

      expect(afterSecond).toBe(afterFirst);
    });

    test('Rejects a non-array keywords parameter', async () => {
      const token = generateToken(testUserId);

      const response = await request(app)
        .post('/api/opportunities/discover')
        .set('Authorization', `Bearer ${token}`)
        .send({ keywords: 'youth' });

      expect(response.status).toBe(400);
    });

    test('Returns 404 when the user has no organization', async () => {
      const response = await request(app)
        .post('/api/opportunities/discover')
        .set('Authorization', `Bearer ${generateToken(uuidv4())}`)
        .send({});

      expect(response.status).toBe(404);
    });

    test('Requires authentication', async () => {
      const response = await request(app).post('/api/opportunities/discover').send({});
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/opportunities', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/opportunities/discover')
        .set('Authorization', `Bearer ${generateToken(testUserId)}`)
        .send({});
    });

    test('Returns actionable matches ranked by fit score', async () => {
      const response = await request(app)
        .get('/api/opportunities')
        .set('Authorization', `Bearer ${generateToken(testUserId)}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);

      const scores = response.body.data.map(m => m.fit_score).filter(s => s !== null);
      const sorted = [...scores].sort((a, b) => b - a);
      expect(scores).toEqual(sorted);

      // Each match carries its opportunity so the UI needs no second call
      expect(response.body.data[0].opportunity).toBeTruthy();
      expect(response.body.data[0].opportunity.title).toBeTruthy();
    });

    test('Excludes prefilter rejects from the default view', async () => {
      const response = await request(app)
        .get('/api/opportunities')
        .set('Authorization', `Bearer ${generateToken(testUserId)}`);

      expect(response.body.data.every(m => m.status !== 'dismissed')).toBe(true);
    });

    test('Surfaces rejects on explicit request, with reasons', async () => {
      const response = await request(app)
        .get('/api/opportunities?status=dismissed')
        .set('Authorization', `Bearer ${generateToken(testUserId)}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].prefilter_result).toBeTruthy();
    });

    test('Rejects an invalid status filter', async () => {
      const response = await request(app)
        .get('/api/opportunities?status=bogus')
        .set('Authorization', `Bearer ${generateToken(testUserId)}`);

      expect(response.status).toBe(400);
    });

    test('Does not leak another org\'s matches', async () => {
      const otherUserId = uuidv4();
      await Organization.create({
        id: uuidv4(), userId: otherUserId, name: 'Unrelated Org', annualBudget: 500000
      });

      const response = await request(app)
        .get('/api/opportunities')
        .set('Authorization', `Bearer ${generateToken(otherUserId)}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });
  });

  describe('PATCH /api/opportunities/:id', () => {
    test('Dismisses a match with a reason', async () => {
      const token = generateToken(testUserId);
      await request(app).post('/api/opportunities/discover')
        .set('Authorization', `Bearer ${token}`).send({});

      const list = await request(app).get('/api/opportunities')
        .set('Authorization', `Bearer ${token}`);
      const matchId = list.body.data[0].id;

      const response = await request(app)
        .patch(`/api/opportunities/${matchId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'dismissed', dismissed_reason: 'Outside our service area' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('dismissed');
      expect(response.body.data.dismissed_reason).toBe('Outside our service area');
    });

    test('Rejects an unknown status value', async () => {
      const token = generateToken(testUserId);
      await request(app).post('/api/opportunities/discover')
        .set('Authorization', `Bearer ${token}`).send({});
      const list = await request(app).get('/api/opportunities')
        .set('Authorization', `Bearer ${token}`);

      const response = await request(app)
        .patch(`/api/opportunities/${list.body.data[0].id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'converted' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/opportunities/:id/convert', () => {
    let token;
    let matchId;

    beforeEach(async () => {
      token = generateToken(testUserId);
      await request(app).post('/api/opportunities/discover')
        .set('Authorization', `Bearer ${token}`).send({});
      const list = await request(app).get('/api/opportunities')
        .set('Authorization', `Bearer ${token}`);
      matchId = list.body.data[0].id;
    });

    test('Creates a grant AND a seeded RFP analysis so a draft can be generated immediately', async () => {
      const response = await request(app)
        .post(`/api/opportunities/${matchId}/convert`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(201);
      expect(response.body.data.grant.id).toBeTruthy();
      expect(response.body.data.rfp_analysis_id).toBeTruthy();

      // The grant traces back to the opportunity it came from
      const grant = await Grant.findByPk(response.body.data.grant.id);
      expect(grant.opportunity_id).toBeTruthy();
      expect(grant.status).toBe('draft');

      // The analysis is linked to that grant, which is what draft generation needs
      const analysis = await RFPAnalysis.findByPk(response.body.data.rfp_analysis_id);
      expect(analysis.grant_id).toBe(grant.id);
      expect(analysis.org_id).toBe(testOrgId);
    });

    test('Converted match leaves the actionable feed', async () => {
      await request(app).post(`/api/opportunities/${matchId}/convert`)
        .set('Authorization', `Bearer ${token}`);

      const list = await request(app).get('/api/opportunities')
        .set('Authorization', `Bearer ${token}`);
      expect(list.body.data.find(m => m.id === matchId)).toBeUndefined();
    });

    test('Refuses to convert the same match twice', async () => {
      await request(app).post(`/api/opportunities/${matchId}/convert`)
        .set('Authorization', `Bearer ${token}`);

      const second = await request(app).post(`/api/opportunities/${matchId}/convert`)
        .set('Authorization', `Bearer ${token}`);

      expect(second.status).toBe(409);
      expect(await Grant.count()).toBe(1);
    });

    test('Does not allow converting another org\'s match', async () => {
      const otherUserId = uuidv4();
      await Organization.create({
        id: uuidv4(), userId: otherUserId, name: 'Unrelated Org', annualBudget: 500000
      });

      const response = await request(app)
        .post(`/api/opportunities/${matchId}/convert`)
        .set('Authorization', `Bearer ${generateToken(otherUserId)}`);

      expect(response.status).toBe(404);
    });

    test('A dismissed opportunity stays dismissed across discovery runs', async () => {
      await request(app)
        .patch(`/api/opportunities/${matchId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'dismissed' });

      await request(app).post('/api/opportunities/discover')
        .set('Authorization', `Bearer ${token}`).send({});

      const match = await OpportunityMatch.findByPk(matchId);
      expect(match.status).toBe('dismissed');
    });
  });
});
