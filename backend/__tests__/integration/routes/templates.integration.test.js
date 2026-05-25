const request = require('supertest');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { sequelize, Template, Organization } = require('../../../src/models');
const { setupTestDatabase } = require('../setup');

const JWT_SECRET = process.env.JWT_SECRET;
// Use random UUIDs to avoid conflicts in parallel test execution
const testUserId = uuidv4();
const testOrgId = uuidv4();

const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
};

describe('Templates Routes Integration Tests', () => {
  let app;
  // Use random UUIDs for "other org" to avoid FK constraint conflicts
  const otherUserId = uuidv4();
  const otherOrgId = uuidv4();

  beforeAll(async () => {
    await setupTestDatabase();
    app = require('../../../src/app');
  });

  beforeEach(async () => {
    await Template.truncate({ cascade: true });
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

  describe('GET /api/templates', () => {
    test('Should return empty list for organization with no templates', async () => {
      const token = generateToken(testUserId);
      const response = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.metadata.total).toBe(0);
    });

    test('Should return list of all templates', async () => {
      const token = generateToken(testUserId);

      // Create 3 templates of different types
      await Template.create({
        org_id: testOrgId,
        name: 'NSF Grant Profile',
        type: 'grant_profile',
        description: 'Standard NSF profile template',
        content: { objective: 'Research innovation' },
        usage_count: 2
      });

      await Template.create({
        org_id: testOrgId,
        name: 'Federal Budget',
        type: 'budget_template',
        description: 'Federal budget format',
        content: { personnel: 'Calculated annually' }
      });

      const response = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.metadata.total).toBe(2);
    });

    test('Should filter templates by type', async () => {
      const token = generateToken(testUserId);

      // Create 2 grant_profile and 1 budget_template
      for (let i = 0; i < 2; i++) {
        await Template.create({
          org_id: testOrgId,
          name: `Profile ${i}`,
          type: 'grant_profile',
          content: {}
        });
      }

      await Template.create({
        org_id: testOrgId,
        name: 'Budget',
        type: 'budget_template',
        content: {}
      });

      const response = await request(app)
        .get('/api/templates?type=grant_profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.every(t => t.type === 'grant_profile')).toBe(true);
    });

    test('Should require authentication', async () => {
      const response = await request(app)
        .get('/api/templates');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/templates', () => {
    test('Should create a new template', async () => {
      const token = generateToken(testUserId);
      const templateData = {
        name: 'New Template',
        type: 'grant_profile',
        description: 'A test template',
        content: { key: 'value' }
      };

      const response = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${token}`)
        .send(templateData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(expect.objectContaining({
        name: 'New Template',
        type: 'grant_profile',
        description: 'A test template'
      }));

      // Verify in database
      const template = await Template.findByPk(response.body.data.id);
      expect(template.org_id).toBe(testOrgId);
    });

    test('Should reject template with invalid type', async () => {
      const token = generateToken(testUserId);
      const response = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Invalid Template',
          type: 'invalid_type',
          content: {}
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid type');
    });

    test('Should require template name', async () => {
      const token = generateToken(testUserId);
      const response = await request(app)
        .post('/api/templates')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'grant_profile',
          content: {}
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('name');
    });
  });

  describe('GET /api/templates/:id', () => {
    test('Should retrieve a single template', async () => {
      const token = generateToken(testUserId);

      const template = await Template.create({
        org_id: testOrgId,
        name: 'Test Template',
        type: 'grant_profile',
        content: { data: 'value' }
      });

      const response = await request(app)
        .get(`/api/templates/${template.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(template.id);
      expect(response.body.data.name).toBe('Test Template');
    });

    test('Should not retrieve other org\'s template', async () => {
      const token = generateToken(testUserId);

      // Create other org first to satisfy FK constraint
      await Organization.create({
        id: otherOrgId,
        userId: otherUserId,
        name: 'Other Organization'
      });

      const otherTemplate = await Template.create({
        org_id: otherOrgId,
        name: 'Other Template',
        type: 'grant_profile',
        content: {}
      });

      const response = await request(app)
        .get(`/api/templates/${otherTemplate.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });

    test('Should return 404 for non-existent template', async () => {
      const token = generateToken(testUserId);
      const response = await request(app)
        .get(`/api/templates/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/templates/:id', () => {
    test('Should update a template', async () => {
      const token = generateToken(testUserId);

      const template = await Template.create({
        org_id: testOrgId,
        name: 'Original Name',
        type: 'grant_profile',
        description: 'Original description',
        content: {}
      });

      const response = await request(app)
        .put(`/api/templates/${template.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Name',
          description: 'Updated description'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.description).toBe('Updated description');
    });

    test('Should not allow updating other org\'s template', async () => {
      const token = generateToken(testUserId);

      // Create other org first to satisfy FK constraint
      await Organization.create({
        id: otherOrgId,
        userId: otherUserId,
        name: 'Other Organization'
      });

      const otherTemplate = await Template.create({
        org_id: otherOrgId,
        name: 'Other',
        type: 'grant_profile',
        content: {}
      });

      const response = await request(app)
        .put(`/api/templates/${otherTemplate.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Hacked' });

      expect(response.status).toBe(403);
    });

    test('Should validate type enum on update', async () => {
      const token = generateToken(testUserId);

      const template = await Template.create({
        org_id: testOrgId,
        name: 'Test',
        type: 'grant_profile',
        content: {}
      });

      const response = await request(app)
        .put(`/api/templates/${template.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'invalid_type' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid type');
    });
  });

  describe('DELETE /api/templates/:id', () => {
    test('Should delete a template', async () => {
      const token = generateToken(testUserId);

      const template = await Template.create({
        org_id: testOrgId,
        name: 'Deletable',
        type: 'grant_profile',
        content: {}
      });

      const response = await request(app)
        .delete(`/api/templates/${template.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const deleted = await Template.findByPk(template.id);
      expect(deleted).toBeNull();
    });

    test('Should not delete other org\'s template', async () => {
      const token = generateToken(testUserId);

      // Create other org first to satisfy FK constraint
      await Organization.create({
        id: otherOrgId,
        userId: otherUserId,
        name: 'Other Organization'
      });

      const otherTemplate = await Template.create({
        org_id: otherOrgId,
        name: 'Other',
        type: 'grant_profile',
        content: {}
      });

      const response = await request(app)
        .delete(`/api/templates/${otherTemplate.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);

      const notDeleted = await Template.findByPk(otherTemplate.id);
      expect(notDeleted).toBeDefined();
    });
  });

  describe('POST /api/templates/:id/duplicate', () => {
    test('Should create a copy of a template', async () => {
      const token = generateToken(testUserId);

      const template = await Template.create({
        org_id: testOrgId,
        name: 'Original',
        type: 'grant_profile',
        description: 'Original description',
        content: { key: 'value' },
        usage_count: 5
      });

      const response = await request(app)
        .post(`/api/templates/${template.id}/duplicate`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(201);
      expect(response.body.data.name).toContain('Original');
      expect(response.body.data.name).toContain('copy');
      expect(response.body.data.type).toBe('grant_profile');
      expect(response.body.data.content).toEqual({ key: 'value' });

      // Verify original usage_count not incremented on copy
      expect(response.body.data.usage_count).toBe(0);
    });

    test('Should not duplicate other org\'s template', async () => {
      const token = generateToken(testUserId);

      // Create other org first to satisfy FK constraint
      await Organization.create({
        id: otherOrgId,
        userId: otherUserId,
        name: 'Other Organization'
      });

      const otherTemplate = await Template.create({
        org_id: otherOrgId,
        name: 'Other',
        type: 'grant_profile',
        content: {}
      });

      const response = await request(app)
        .post(`/api/templates/${otherTemplate.id}/duplicate`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });
});
