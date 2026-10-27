const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

describe('routes/web.js wiring', () => {
    test('web routes and middleware', (t) => {
        // Mock PageController with named recording functions
        const pageControllerPath = path.resolve(__dirname, '..', 'controllers', 'PageController.js');
        const PageController = {
            renderLogin: t.mock.fn(function renderLogin() {}),
            renderRegister: t.mock.fn(function renderRegister() {}),
            renderOverview: t.mock.fn(function renderOverview() {}),
            renderMapview: t.mock.fn(function renderMapview() {}),
            renderShareview: t.mock.fn(function renderShareview() {}),
            renderShare: t.mock.fn(function renderShare() {}),
            renderEdit: t.mock.fn(function renderEdit() {})
        };
        require.cache[pageControllerPath] = {
            id: pageControllerPath,
            filename: pageControllerPath,
            loaded: true,
            exports: PageController
        };

        // Mock auth middleware with a named recording function
        const authPath = path.resolve(__dirname, '..', 'middleware', 'auth.js');
        const authenticate = t.mock.fn(function authenticate() {});
        require.cache[authPath] = {
            id: authPath,
            filename: authPath,
            loaded: true,
            exports: authenticate
        };

        // Require router after mocking
        const router = require('../routes/web');

        assert.strictEqual(router.stack.length, 8, 'There should be exactly 8 routes');

        const expectedRoutes = [
            { method: 'get', path: '/' },
            { method: 'get', path: '/login', handlers: [PageController.renderLogin] },
            { method: 'get', path: '/register', handlers: [PageController.renderRegister] },
            { method: 'get', path: '/overview', handlers: [authenticate, PageController.renderOverview] },
            { method: 'get', path: '/mapview', handlers: [authenticate, PageController.renderMapview] },
            { method: 'get', path: '/shareview/:shareId', handlers: [PageController.renderShareview] },
            { method: 'get', path: '/share', handlers: [authenticate, PageController.renderShare] },
            { method: 'get', path: '/edit/:sessionId', handlers: [authenticate, PageController.renderEdit] }
        ];

        const actualRoutes = router.stack.map(layer => {
            const method = Object.keys(layer.route.methods)[0];
            const path = layer.route.path;
            const handlers = layer.route.stack.map(s => s.handle);
            return { method, path, handlers };
        });

        for (let i = 0; i < expectedRoutes.length; i++) {
            const expected = expectedRoutes[i];
            const actual = actualRoutes[i];

            assert.strictEqual(actual.method, expected.method, `Route ${i} (${expected.path}) method mismatch`);
            assert.strictEqual(actual.path, expected.path, `Route ${i} (${expected.path}) path mismatch`);

            if (expected.path === '/') {
                assert.strictEqual(actual.handlers.length, 1, `Route / should have exactly 1 handler`);

                let redirectUrl = null;
                const fakeReq = {};
                const fakeRes = {
                    redirect: (url) => { redirectUrl = url; }
                };
                actual.handlers[0](fakeReq, fakeRes);
                assert.strictEqual(redirectUrl, '/overview', `Route / should redirect to /overview`);
            } else {
                assert.strictEqual(actual.handlers.length, expected.handlers.length, `Route ${expected.path} handlers length mismatch`);
                for (let j = 0; j < expected.handlers.length; j++) {
                    assert.strictEqual(actual.handlers[j], expected.handlers[j], `Route ${expected.path} handler ${j} mismatch`);
                }
            }
        }
    });
});
