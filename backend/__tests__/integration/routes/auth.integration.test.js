const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User } = require('../../../src/models');
const { setupTestDatabase } = require('../setup');
const { ensureDefaultUser } = require('../../../src/routes/auth');

const JWT_SECRET = process.env.JWT_SECRET;

describe('Auth Routes Integration Tests (persistent users)', () => {
  let app;

  beforeAll(async () => {
    await setupTestDatabase();
    app = require('../../../src/app');
  });

  beforeEach(async () => {
    await User.truncate({ cascade: true });
  });

  describe('POST /api/auth/signup', () => {
    test('Should create a user in the database and return a valid JWT', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'newuser@test.com', password: 'secret123!!' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('newuser@test.com');

      // Token is valid and carries the DB user id
      const decoded = jwt.verify(response.body.data.token, JWT_SECRET);
      expect(decoded.userId).toBe(response.body.data.user.userId);

      // User persisted in DB
      const dbUser = await User.findOne({ where: { email: 'newuser@test.com' } });
      expect(dbUser).not.toBeNull();
      expect(dbUser.id).toBe(decoded.userId);
    });

    test('Should hash the password (never store plaintext)', async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({ email: 'hashed@test.com', password: 'plaintext-pw' });

      const dbUser = await User.findOne({ where: { email: 'hashed@test.com' } });
      expect(dbUser.password_hash).not.toBe('plaintext-pw');
      expect(await bcrypt.compare('plaintext-pw', dbUser.password_hash)).toBe(true);
    });

    test('Should reject duplicate email with 409', async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({ email: 'dupe@test.com', password: 'password-one' });

      const response = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'dupe@test.com', password: 'password-two' });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });

    test('Should require email and password', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'only@test.com' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      const password_hash = await bcrypt.hash('correct-pw', 10);
      await User.create({ email: 'login@test.com', password_hash });
    });

    test('Should log in with correct credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@test.com', password: 'correct-pw' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const decoded = jwt.verify(response.body.data.token, JWT_SECRET);
      expect(decoded.email).toBe('login@test.com');
    });

    test('Should reject wrong password with 401', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@test.com', password: 'wrong-pw' });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid credentials');
    });

    test('Should reject unknown email with 401', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'whatever' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/auth/default-token', () => {
    test('Should seed default user via ensureDefaultUser and return a token', async () => {
      await ensureDefaultUser();

      const response = await request(app).get('/api/auth/default-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const decoded = jwt.verify(response.body.data.token, JWT_SECRET);
      expect(decoded.userId).toBeTruthy();
    });

    test('Should return 500 when default user is not seeded', async () => {
      const response = await request(app).get('/api/auth/default-token');

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('not initialized');
    });

    test('ensureDefaultUser should be idempotent', async () => {
      await ensureDefaultUser();
      await ensureDefaultUser();

      const count = await User.count();
      expect(count).toBe(1);
    });
  });
});
