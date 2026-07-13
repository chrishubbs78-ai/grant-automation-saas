const request = require('supertest');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { Grant, Organization, Outcome, Draft, ReapplyCandidate } = require('../../../src/models');
const { setupTestDatabase } = require('../setup');

const JWT_SECRET = process.env.JWT_SECRET;
const testUserId = uuidv4();
const testOrgId = uuidv4();

const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
};

describe('Reapply Routes Integration Tests', () => {
  let app;
  let token;

  beforeAll(async () => {
    await setupTestDatabase();
    app = require('../../../src/app');
    token = generateToken(testUserId);
  });

  beforeEach(async () => {
    await ReapplyCandidate.truncate({ cascade: true });
    await Outcome.truncate({ cascade: true });
    await Draft.truncate({ cascade: true });
    await Grant.truncate({ cascade: true });
    await Organization.truncate({ cascade: true });

    await Organization.create({
      id: testOrgId,
      userId: testUserId,
      name: 'Test Organization',
      mission: 'Test mission'
    });
  });

  // Helper: create a rejected grant with an outcome and a previous draft
  async function createRejectedGrant({ deadline = new Date('2026-01-15'), notes = 'Budget was unclear' } = {}) {
    const grant = await Grant.create({
      org_id: testOrgId,
      funder_name: 'Example Foundation',
      deadline,
      amount: 100000,
      status: 'rejected',
      rfp_analysis: { funder_name: 'Example Foundation' }
    });

    const outcome = await Outcome.create({
      grant_id: grant.id,
      org_id: testOrgId,
      funded: false,
      funder_type: 'foundation',
      notes,
      outcome_date: new Date()
    });

    await Draft.create({
      grant_id: grant.id,
      org_id: testOrgId,
      version: 1,
      problem_statement: 'Original problem statement',
      impact_statement: 'Original impact statement',
      budget_narrative: 'Original budget narrative'
    });

    return { grant, outcome };
  }

  describe('POST /api/reapply/scan', () => {
    test('Should detect rejected grants as candidates', async () => {
      await createRejectedGrant();

      const response = await request(app)
        .post('/api/reapply/scan')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.detected).toBe(1);
    });

    test('Should not duplicate candidates on repeat scans', async () => {
      await createRejectedGrant();

      await request(app).post('/api/reapply/scan').set('Authorization', `Bearer ${token}`);
      const second = await request(app).post('/api/reapply/scan').set('Authorization', `Bearer ${token}`);

      expect(second.body.data.detected).toBe(0);
      const count = await ReapplyCandidate.count({ where: { org_id: testOrgId } });
      expect(count).toBe(1);
    });
  });

  describe('GET /api/reapply/candidates', () => {
    test('Should list candidates with original grant included', async () => {
      const { grant } = await createRejectedGrant();
      await request(app).post('/api/reapply/scan').set('Authorization', `Bearer ${token}`);

      const response = await request(app)
        .get('/api/reapply/candidates')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].grant_id).toBe(grant.id);
      expect(response.body.data[0].originalGrant.funder_name).toBe('Example Foundation');
      expect(response.body.data[0].rejection_notes).toBe('Budget was unclear');
    });

    test('Should filter candidates by status', async () => {
      await createRejectedGrant();
      await request(app).post('/api/reapply/scan').set('Authorization', `Bearer ${token}`);

      const response = await request(app)
        .get('/api/reapply/candidates?status=reapplied')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('POST /api/reapply/candidates/:id/execute', () => {
    test('Should create a new linked grant with an improved draft', async () => {
      const { grant } = await createRejectedGrant();
      await request(app).post('/api/reapply/scan').set('Authorization', `Bearer ${token}`);
      const candidate = await ReapplyCandidate.findOne({ where: { grant_id: grant.id } });

      const response = await request(app)
        .post(`/api/reapply/candidates/${candidate.id}/execute`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.grant.parent_grant_id).toBe(grant.id);
      expect(response.body.data.grant.status).toBe('draft');
      expect(response.body.data.grant.reapply_count).toBe(1);
      expect(response.body.data.draft.version).toBe(2);
      expect(response.body.data.draft.problem_statement).toBeTruthy();

      const updated = await ReapplyCandidate.findByPk(candidate.id);
      expect(updated.status).toBe('reapplied');
      expect(updated.new_grant_id).toBe(response.body.data.grant.id);
    });

    test('Should reject executing an already-reapplied candidate', async () => {
      const { grant } = await createRejectedGrant();
      await request(app).post('/api/reapply/scan').set('Authorization', `Bearer ${token}`);
      const candidate = await ReapplyCandidate.findOne({ where: { grant_id: grant.id } });

      await request(app)
        .post(`/api/reapply/candidates/${candidate.id}/execute`)
        .set('Authorization', `Bearer ${token}`);

      const second = await request(app)
        .post(`/api/reapply/candidates/${candidate.id}/execute`)
        .set('Authorization', `Bearer ${token}`);

      expect(second.status).toBe(409);
    });

    test('Should return 404 for unknown candidate', async () => {
      const response = await request(app)
        .post(`/api/reapply/candidates/${uuidv4()}/execute`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/reapply/candidates/:id/dismiss', () => {
    test('Should dismiss a candidate', async () => {
      const { grant } = await createRejectedGrant();
      await request(app).post('/api/reapply/scan').set('Authorization', `Bearer ${token}`);
      const candidate = await ReapplyCandidate.findOne({ where: { grant_id: grant.id } });

      const response = await request(app)
        .post(`/api/reapply/candidates/${candidate.id}/dismiss`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('dismissed');
    });
  });

  describe('PATCH /api/reapply/candidates/:id', () => {
    test('Should enable auto_reapply', async () => {
      const { grant } = await createRejectedGrant();
      await request(app).post('/api/reapply/scan').set('Authorization', `Bearer ${token}`);
      const candidate = await ReapplyCandidate.findOne({ where: { grant_id: grant.id } });

      const response = await request(app)
        .patch(`/api/reapply/candidates/${candidate.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ auto_reapply: true });

      expect(response.status).toBe(200);
      expect(response.body.data.auto_reapply).toBe(true);
    });

    test('Should override next_cycle_date', async () => {
      const { grant } = await createRejectedGrant();
      await request(app).post('/api/reapply/scan').set('Authorization', `Bearer ${token}`);
      const candidate = await ReapplyCandidate.findOne({ where: { grant_id: grant.id } });

      const response = await request(app)
        .patch(`/api/reapply/candidates/${candidate.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ next_cycle_date: '2027-09-01' });

      expect(response.status).toBe(200);
      expect(new Date(response.body.data.next_cycle_date).getFullYear()).toBe(2027);
    });

    test('Should return 400 with no valid fields', async () => {
      const { grant } = await createRejectedGrant();
      await request(app).post('/api/reapply/scan').set('Authorization', `Bearer ${token}`);
      const candidate = await ReapplyCandidate.findOne({ where: { grant_id: grant.id } });

      const response = await request(app)
        .patch(`/api/reapply/candidates/${candidate.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('Outcome recording integration', () => {
    test('Recording a rejection should auto-create a reapply candidate', async () => {
      const grant = await Grant.create({
        org_id: testOrgId,
        funder_name: 'Auto Foundation',
        deadline: new Date('2026-02-01'),
        amount: 50000,
        status: 'submitted'
      });

      const response = await request(app)
        .post(`/api/outcomes/${grant.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ funded: false, funder_type: 'foundation', notes: 'Too broad in scope' });

      expect(response.status).toBe(200);
      expect(response.body.data.reapplyCandidate).toBeTruthy();
      expect(response.body.data.reapplyCandidate.rejection_notes).toBe('Too broad in scope');

      const candidate = await ReapplyCandidate.findOne({ where: { grant_id: grant.id } });
      expect(candidate).toBeTruthy();
    });

    test('Recording a funded outcome should not create a candidate', async () => {
      const grant = await Grant.create({
        org_id: testOrgId,
        funder_name: 'Win Foundation',
        amount: 50000,
        status: 'submitted'
      });

      const response = await request(app)
        .post(`/api/outcomes/${grant.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ funded: true, funder_type: 'foundation' });

      expect(response.status).toBe(200);
      expect(response.body.data.reapplyCandidate).toBeNull();

      const candidate = await ReapplyCandidate.findOne({ where: { grant_id: grant.id } });
      expect(candidate).toBeNull();
    });
  });
});
