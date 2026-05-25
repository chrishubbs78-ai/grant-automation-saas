const request = require('supertest');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { sequelize, Grant, Organization } = require('../../../src/models');
const { setupTestDatabase } = require('../setup');

const JWT_SECRET = process.env.JWT_SECRET;
// Use random UUIDs to avoid conflicts in parallel test execution
const testUserId = uuidv4();
const testOrgId = uuidv4();

// Generate valid JWT
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
};

describe('Grants Routes Integration Tests', () => {
  let app;
  // Use random UUIDs for "other org" to avoid FK constraint conflicts
  const otherUserId = uuidv4();
  const otherOrgId = uuidv4();

  beforeAll(async () => {
    // Setup database once
    await setupTestDatabase();

    // Initialize app
    app = require('../../../src/app');
  });

  beforeEach(async () => {
    // Clean up before each test
    await Grant.truncate({ cascade: true });
    await Organization.truncate({ cascade: true });

    // Create test organization
    await Organization.create({
      id: testOrgId,
      userId: testUserId,
      name: 'Test Organization',
      mission: 'Test mission'
    });
  });

  afterAll(async () => {
    // Don't close here; let cleanup handle it
  });

  describe('GET /api/grants', () => {
    test('Should return empty list for user with no grants', async () => {
      const token = generateToken(testUserId);
      const response = await request(app)
        .get('/api/grants')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
        metadata: expect.objectContaining({
          total: 0,
          page: 1,
          limit: 20
        })
      });
    });

    test('Should return paginated list of grants', async () => {
      const token = generateToken(testUserId);

      // Create 5 grants
      for (let i = 0; i < 5; i++) {
        await Grant.create({
          org_id: testOrgId,
          funder_name: `Funder ${i}`,
          deadline: new Date('2026-12-31'),
          amount: 50000 + (i * 10000),
          status: 'draft'
        });
      }

      const response = await request(app)
        .get('/api/grants')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(5);
      expect(response.body.metadata).toEqual(expect.objectContaining({
        total: 5,
        page: 1,
        limit: 20,
        hasMore: false
      }));
    });

    test('Should filter grants by status', async () => {
      const token = generateToken(testUserId);

      // Create 3 draft and 2 submitted grants
      for (let i = 0; i < 3; i++) {
        await Grant.create({
          org_id: testOrgId,
          funder_name: `Funder ${i}`,
          status: 'draft'
        });
      }
      for (let i = 0; i < 2; i++) {
        await Grant.create({
          org_id: testOrgId,
          funder_name: `Submitted ${i}`,
          status: 'submitted'
        });
      }

      const response = await request(app)
        .get('/api/grants?status=submitted')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every(g => g.status === 'submitted')).toBe(true);
    });

    test('Should require valid token', async () => {
      const response = await request(app)
        .get('/api/grants')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/grants', () => {
    test('Should create a new grant', async () => {
      const token = generateToken(testUserId);
      const grantData = {
        funder_name: 'New Funder',
        deadline: '2026-12-31',
        amount: 100000,
        status: 'draft'
      };

      const response = await request(app)
        .post('/api/grants')
        .set('Authorization', `Bearer ${token}`)
        .send(grantData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(expect.objectContaining({
        funder_name: 'New Funder',
        amount: 100000,
        status: 'draft'
      }));

      // Verify it's stored
      const grant = await Grant.findByPk(response.body.data.id);
      expect(grant).toBeDefined();
      expect(grant.org_id).toBe(testOrgId);
    });

    test('Should require authentication', async () => {
      const response = await request(app)
        .post('/api/grants')
        .send({
          funder_name: 'New Funder',
          status: 'draft'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/grants/:id', () => {
    test('Should update a grant', async () => {
      const token = generateToken(testUserId);

      // Create a grant
      const grant = await Grant.create({
        org_id: testOrgId,
        funder_name: 'Original Funder',
        status: 'draft'
      });

      const response = await request(app)
        .put(`/api/grants/${grant.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'submitted',
          amount: 75000
        });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('submitted');
      expect(response.body.data.amount).toBe(75000);
    });

    test('Should not allow updating other org\'s grants', async () => {
      const token = generateToken(testUserId);

      // Create other org first to satisfy FK constraint
      await Organization.create({
        id: otherOrgId,
        userId: otherUserId,
        name: 'Other Organization'
      });

      // Create grant for different org
      const otherGrant = await Grant.create({
        org_id: otherOrgId,
        funder_name: 'Other Org Funder',
        status: 'draft'
      });

      const response = await request(app)
        .put(`/api/grants/${otherGrant.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'submitted' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('Should not allow updating org_id or other protected fields', async () => {
      const token = generateToken(testUserId);

      const grant = await Grant.create({
        org_id: testOrgId,
        funder_name: 'Test Funder',
        status: 'draft'
      });

      const response = await request(app)
        .put(`/api/grants/${grant.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          org_id: 'hacked-org-id',
          status: 'submitted'
        });

      expect(response.status).toBe(200);
      // Verify org_id wasn't actually changed
      const updated = await Grant.findByPk(grant.id);
      expect(updated.org_id).toBe(testOrgId);
    });
  });

  describe('DELETE /api/grants/:id', () => {
    test('Should delete a grant', async () => {
      const token = generateToken(testUserId);

      const grant = await Grant.create({
        org_id: testOrgId,
        funder_name: 'Deletable Funder',
        status: 'draft'
      });

      const response = await request(app)
        .delete(`/api/grants/${grant.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify it's deleted
      const deleted = await Grant.findByPk(grant.id);
      expect(deleted).toBeNull();
    });

    test('Should not delete other org\'s grants', async () => {
      const token = generateToken(testUserId);

      // Create other org first to satisfy FK constraint
      await Organization.create({
        id: otherOrgId,
        userId: otherUserId,
        name: 'Other Organization'
      });

      const otherGrant = await Grant.create({
        org_id: otherOrgId,
        funder_name: 'Other Org Funder',
        status: 'draft'
      });

      const response = await request(app)
        .delete(`/api/grants/${otherGrant.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);

      // Verify it wasn't deleted
      const grant = await Grant.findByPk(otherGrant.id);
      expect(grant).toBeDefined();
    });
  });
});
