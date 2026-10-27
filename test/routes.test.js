const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const mockController = (name) => {
    const resolved = path.resolve(__dirname, '..', 'controllers', name + '.js');
    const proxy = new Proxy({}, {
        get: (target, prop) => {
            if (!target[prop]) {
                target[prop] = () => {};
            }
            return target[prop];
        }
    });
    require.cache[resolved] = {
        id: resolved,
        filename: resolved,
        loaded: true,
        exports: proxy
    };
    return proxy;
};

const mockAuth = () => {
    const resolved = path.resolve(__dirname, '..', 'middleware', 'auth.js');
    const authMiddleware = (req, res, next) => next();
    require.cache[resolved] = {
        id: resolved,
        filename: resolved,
        loaded: true,
        exports: authMiddleware
    };
    return authMiddleware;
};

describe('Routes wiring', () => {
    test('routes/api.js routes and middleware', (t) => {
        const SessionController = mockController('SessionController');
        const UploadController = mockController('UploadController');
        const UserController = mockController('UserController');
        const auth = mockAuth();

        const router = require('../routes/api');

        const expectedRoutes = [
            { method: 'get', path: '/upload', handlers: [UploadController.processUpload] },
            { method: 'post', path: '/users/register', handlers: [UserController.register] },
            { method: 'post', path: '/users/login', handlers: [UserController.login] },
            { method: 'get', path: '/users/logout', handlers: [UserController.logout] },
            { method: 'get', path: '/users/shareid', handlers: [auth, UserController.getShareId] },
            { method: 'get', path: '/users/forwardurls', handlers: [auth, UserController.getForwardUrls] },
            { method: 'put', path: '/users/forwardurls', handlers: [auth, UserController.updateForwardUrls] },
            { method: 'patch', path: '/users/shareid', handlers: [auth, UserController.toggleShareId] },
            { method: 'get', path: '/sessions', handlers: [auth, SessionController.getAll] },
            { method: 'get', path: '/sessions/shared/:shareId', handlers: [SessionController.getAllShared] },
            { method: 'get', path: '/sessions/shared/:shareId/:sessionId', handlers: [SessionController.getOneShared] },
            { method: 'get', path: '/sessions/:sessionId', handlers: [auth, SessionController.getOne] },
            { method: 'delete', path: '/sessions/:sessionId', handlers: [auth, SessionController.delete] },
            { method: 'patch', path: '/sessions/rename/:sessionId', handlers: [auth, SessionController.rename] },
            { method: 'patch', path: '/sessions/addlocation/:sessionId', handlers: [auth, SessionController.addLocation] },
            { method: 'patch', path: '/sessions/filter/:sessionId', handlers: [auth, SessionController.filter] },
            { method: 'patch', path: '/sessions/cut/:sessionId', handlers: [auth, SessionController.cut] },
            { method: 'post', path: '/sessions/copy/:sessionId', handlers: [auth, SessionController.copy] },
            { method: 'post', path: '/sessions/join/:sessionId', handlers: [auth, SessionController.join] }
        ];

        const actualRoutes = router.stack.map(layer => {
            const method = Object.keys(layer.route.methods)[0];
            const path = layer.route.path;
            const handlers = layer.route.stack.map(s => s.handle);
            return { method, path, handlers };
        });

        assert.strictEqual(actualRoutes.length, expectedRoutes.length, 'Should have exact number of routes');

        for (let i = 0; i < expectedRoutes.length; i++) {
            const expected = expectedRoutes[i];
            const actual = actualRoutes[i];

            assert.strictEqual(actual.method, expected.method, `Route ${i} method mismatch`);
            assert.strictEqual(actual.path, expected.path, `Route ${i} path mismatch`);

            assert.strictEqual(actual.handlers.length, expected.handlers.length, `Route ${i} handlers length mismatch`);
            for (let j = 0; j < expected.handlers.length; j++) {
                assert.strictEqual(actual.handlers[j], expected.handlers[j], `Route ${i} handler ${j} reference mismatch`);
            }
        }
    });

    test('routes/404.js branches', async (t) => {
        const router = require('../routes/404');
        assert.strictEqual(router.stack.length, 1);
        const layer = router.stack[0];
        assert.strictEqual(Object.keys(layer.route.methods)[0], 'get');
        assert.strictEqual(layer.route.path, '*');
        const handler = layer.route.stack[0].handle;

        await t.test('html accept', () => {
            let statusCode, renderView, renderOpts;
            const req = {
                url: '/foo',
                accepts: (type) => type === 'html'
            };
            const res = {
                status: (code) => { statusCode = code; return res; },
                render: (view, opts) => { renderView = view; renderOpts = opts; }
            };

            handler(req, res);

            assert.strictEqual(statusCode, 404);
            assert.strictEqual(renderView, '404');
            assert.deepStrictEqual(renderOpts, { url: '/foo' });
        });

        await t.test('json accept', () => {
            let statusCode, sendData;
            const req = {
                accepts: (type) => type === 'json'
            };
            const res = {
                status: (code) => { statusCode = code; return res; },
                send: (data) => { sendData = data; }
            };

            handler(req, res);

            assert.strictEqual(statusCode, 404);
            assert.deepStrictEqual(sendData, { error: 'Not found' });
        });

        await t.test('plain-text default', () => {
            let statusCode, typeName, sendData;
            const req = {
                accepts: (type) => false
            };
            const res = {
                status: (code) => { statusCode = code; return res; },
                type: (t) => { typeName = t; return res; },
                send: (data) => { sendData = data; }
            };

            handler(req, res);

            assert.strictEqual(statusCode, 404);
            assert.strictEqual(typeName, 'txt');
            assert.strictEqual(sendData, 'Not found');
        });
    });
});
