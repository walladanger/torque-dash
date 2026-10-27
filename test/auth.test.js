const test = require('node:test');
const assert = require('node:assert/strict');
const authenticate = require('../middleware/auth');

test('authenticate middleware', async (t) => {
  await t.test('calls next() once and does not call res.redirect when req.isAuthenticated() is true', () => {
    let nextCalled = 0;
    let redirectCalled = 0;

    const req = {
      isAuthenticated: () => true
    };
    const res = {
      redirect: () => {
        redirectCalled++;
      }
    };
    const next = () => {
      nextCalled++;
    };

    authenticate(req, res, next);

    assert.equal(nextCalled, 1, 'next() should be called once');
    assert.equal(redirectCalled, 0, 'res.redirect should not be called');
  });

  await t.test('calls res.redirect("/login") once and does not call next() when req.isAuthenticated() is false', () => {
    let nextCalled = 0;
    let redirectCalled = 0;
    let redirectUrl = null;

    const req = {
      isAuthenticated: () => false
    };
    const res = {
      redirect: (url) => {
        redirectCalled++;
        redirectUrl = url;
      }
    };
    const next = () => {
      nextCalled++;
    };

    authenticate(req, res, next);

    assert.equal(nextCalled, 0, 'next() should not be called');
    assert.equal(redirectCalled, 1, 'res.redirect should be called once');
    assert.equal(redirectUrl, '/login', 'res.redirect should be called with "/login"');
  });
});
