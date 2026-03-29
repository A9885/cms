const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';

const { authMiddleware } = require('../src/middleware/auth.middleware');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test('returns 401 when token is missing', () => {
  const req = { cookies: {}, headers: {} };
  const res = createRes();
  let nextCalled = false;

  authMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Unauthorized. Please login.' });
});

test('accepts token from cookie and attaches decoded user', () => {
  const token = jwt.sign({ id: 1, username: 'alice', role: 'Admin' }, process.env.JWT_SECRET);
  const req = { cookies: { token }, headers: {} };
  const res = createRes();
  let nextCalled = false;

  authMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.user.username, 'alice');
  assert.equal(req.user.role, 'Admin');
});

test('accepts token from Authorization header', () => {
  const token = jwt.sign({ id: 2, username: 'bob', role: 'Partner' }, process.env.JWT_SECRET);
  const req = { cookies: {}, headers: { authorization: `Bearer ${token}` } };
  const res = createRes();
  let nextCalled = false;

  authMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.user.username, 'bob');
});

test('returns 401 for invalid token', () => {
  const req = { cookies: { token: 'not-a-real-token' }, headers: {} };
  const res = createRes();
  let nextCalled = false;

  authMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Invalid or expired token' });
});
