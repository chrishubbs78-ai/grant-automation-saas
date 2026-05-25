const jwt = require('jsonwebtoken');
const { verifyToken } = require('../../../src/middleware/auth');

describe('Auth Middleware - verifyToken', () => {
  const JWT_SECRET = process.env.JWT_SECRET;
  const testUserId = '550e8400-e29b-41d4-a716-446655440000';

  test('Valid JWT token should extract userId and call next()', () => {
    const validToken = jwt.sign(
      { userId: testUserId },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const req = {
      headers: {
        authorization: `Bearer ${validToken}`
      }
    };
    const res = {};
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(req.user).toBeDefined();
    expect(req.user.userId).toBe(testUserId);
    expect(next).toHaveBeenCalled();
  });

  test('Missing Authorization header should return 401', () => {
    const req = {
      headers: {}
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.any(String)
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('Malformed Authorization header should return 401', () => {
    const req = {
      headers: {
        authorization: 'InvalidFormat'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('Expired JWT token should return 401', () => {
    const expiredToken = jwt.sign(
      { userId: testUserId },
      JWT_SECRET,
      { expiresIn: '-1h' }
    );

    const req = {
      headers: {
        authorization: `Bearer ${expiredToken}`
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('Token signed with wrong secret should return 401', () => {
    const wrongToken = jwt.sign(
      { userId: testUserId },
      'wrong-secret',
      { expiresIn: '24h' }
    );

    const req = {
      headers: {
        authorization: `Bearer ${wrongToken}`
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
