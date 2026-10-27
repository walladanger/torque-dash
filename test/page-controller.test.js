const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Fake models
const fakeModels = {
    User: {
        findOne: test.mock.fn()
    }
};

// Stub ../models via require.cache
const modelsPath = path.resolve(__dirname, '../models/index.js');
require.cache[modelsPath] = {
    id: modelsPath,
    filename: modelsPath,
    loaded: true,
    exports: fakeModels
};

const PageController = require('../controllers/PageController');

function createFakeRes() {
    return {
        render: test.mock.fn(),
        redirect: test.mock.fn()
    };
}

test('PageController', async (t) => {
    t.beforeEach(() => {
        fakeModels.User.findOne.mock.resetCalls();
    });

    await t.test('renderOverview', async () => {
        const req = { user: { email: 'test@example.com' } };
        const res = createFakeRes();
        await PageController.renderOverview(req, res);

        assert.equal(res.render.mock.calls.length, 1);
        assert.equal(res.render.mock.calls[0].arguments[0], 'dashboard');
        assert.deepEqual(res.render.mock.calls[0].arguments[1], {
            dashboard: true,
            overview: true,
            userEmail: 'test@example.com',
            loggedIn: true
        });
    });

    await t.test('renderMapview', async () => {
        const req = { user: { email: 'test@example.com' } };
        const res = createFakeRes();
        await PageController.renderMapview(req, res);

        assert.equal(res.render.mock.calls.length, 1);
        assert.equal(res.render.mock.calls[0].arguments[0], 'mapview');
        assert.deepEqual(res.render.mock.calls[0].arguments[1], {
            dashboard: true,
            mapview: true,
            userEmail: 'test@example.com',
            loggedIn: true
        });
    });

    await t.test('renderShareview - user found', async () => {
        const req = { params: { shareId: '123' } };
        const res = createFakeRes();
        fakeModels.User.findOne.mock.mockImplementationOnce(async () => ({}));

        await PageController.renderShareview(req, res);

        assert.equal(fakeModels.User.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.findOne.mock.calls[0].arguments[0], { where: { shareId: '123' } });

        assert.equal(res.render.mock.calls.length, 1);
        assert.equal(res.render.mock.calls[0].arguments[0], 'shareview');
        assert.deepEqual(res.render.mock.calls[0].arguments[1], {
            dashboard: true,
            shareview: true,
        });
    });

    await t.test('renderShareview - user not found', async () => {
        const req = { params: { shareId: '123' } };
        const res = createFakeRes();
        fakeModels.User.findOne.mock.mockImplementationOnce(async () => null);

        await PageController.renderShareview(req, res);

        assert.equal(fakeModels.User.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.findOne.mock.calls[0].arguments[0], { where: { shareId: '123' } });

        assert.equal(res.render.mock.calls.length, 1);
        assert.equal(res.render.mock.calls[0].arguments[0], '404');
        assert.equal(res.render.mock.calls[0].arguments[1], undefined);
    });

    await t.test('renderLogin - already logged in', async () => {
        const req = { user: { id: 1 } };
        const res = createFakeRes();

        await PageController.renderLogin(req, res);

        assert.equal(res.redirect.mock.calls.length, 1);
        assert.equal(res.redirect.mock.calls[0].arguments[0], '/overview');
        assert.equal(res.render.mock.calls.length, 0);
    });

    await t.test('renderLogin - not logged in', async () => {
        const req = {};
        const res = createFakeRes();

        await PageController.renderLogin(req, res);

        assert.equal(res.render.mock.calls.length, 1);
        assert.equal(res.render.mock.calls[0].arguments[0], 'login');
        assert.equal(res.render.mock.calls[0].arguments[1], undefined);
        assert.equal(res.redirect.mock.calls.length, 0);
    });

    await t.test('renderRegister', async () => {
        const req = {};
        const res = createFakeRes();

        await PageController.renderRegister(req, res);

        assert.equal(res.render.mock.calls.length, 1);
        assert.equal(res.render.mock.calls[0].arguments[0], 'register');
        assert.deepEqual(res.render.mock.calls[0].arguments[1], {
            register: true
        });
    });

    await t.test('renderEdit', async () => {
        const req = { user: { email: 'test@example.com' } };
        const res = createFakeRes();

        await PageController.renderEdit(req, res);

        assert.equal(res.render.mock.calls.length, 1);
        assert.equal(res.render.mock.calls[0].arguments[0], 'edit');
        assert.deepEqual(res.render.mock.calls[0].arguments[1], {
            dashboard: true,
            edit: true,
            userEmail: 'test@example.com',
            loggedIn: true
        });
    });

    await t.test('renderShare', async () => {
        const req = { user: { email: 'test@example.com' } };
        const res = createFakeRes();

        await PageController.renderShare(req, res);

        assert.equal(res.render.mock.calls.length, 1);
        assert.equal(res.render.mock.calls[0].arguments[0], 'share');
        assert.deepEqual(res.render.mock.calls[0].arguments[1], {
            dashboard: true,
            share: true,
            userEmail: 'test@example.com',
            loggedIn: true
        });
    });
});