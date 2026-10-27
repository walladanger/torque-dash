const { test, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Setup fakes
const modelsPath = require.resolve('../models');
const passportPath = require.resolve('passport');
const shortidPath = require.resolve('shortid');

const fakeModels = {
    User: {
        validate: mock.fn(() => ({ error: null })),
        findOne: mock.fn(async () => null),
        create: mock.fn(async () => ({}))
    }
};

const fakePassport = {
    authenticate: mock.fn(() => mock.fn())
};

const fakeShortid = {
    generate: mock.fn(() => 'fake-short-id')
};

require.cache[modelsPath] = {
    id: modelsPath,
    filename: modelsPath,
    loaded: true,
    exports: fakeModels
};

require.cache[passportPath] = {
    id: passportPath,
    filename: passportPath,
    loaded: true,
    exports: fakePassport
};

require.cache[shortidPath] = {
    id: shortidPath,
    filename: shortidPath,
    loaded: true,
    exports: fakeShortid
};

const UserController = require('../controllers/UserController');

function createFakeRes() {
    const res = {
        status: mock.fn(() => res),
        send: mock.fn(() => res),
        sendStatus: mock.fn(() => res),
        render: mock.fn(() => res),
        redirect: mock.fn(() => res)
    };
    return res;
}

test('UserController.login', async (t) => {
    beforeEach(() => {
        fakePassport.authenticate.mock.resetCalls();
    });

    await t.test('calls passport.authenticate and executes the returned middleware', async () => {
        const req = {};
        const res = {};
        const next = mock.fn();

        const authMiddleware = mock.fn();
        fakePassport.authenticate.mock.mockImplementationOnce(() => authMiddleware);

        await UserController.login(req, res, next);

        assert.equal(fakePassport.authenticate.mock.calls.length, 1);
        assert.deepEqual(fakePassport.authenticate.mock.calls[0].arguments, [
            'local',
            {
                successRedirect: '/',
                failureRedirect: '/login',
                failureFlash: true
            }
        ]);

        assert.equal(authMiddleware.mock.calls.length, 1);
        assert.equal(authMiddleware.mock.calls[0].arguments[0], req);
        assert.equal(authMiddleware.mock.calls[0].arguments[1], res);
        assert.equal(authMiddleware.mock.calls[0].arguments[2], next);
    });
});

test('UserController.logout', async (t) => {
    await t.test('calls req.logout, req.flash and res.redirect', async () => {
        const req = {
            logout: mock.fn(),
            flash: mock.fn()
        };
        const res = createFakeRes();

        UserController.logout(req, res);

        assert.equal(req.logout.mock.calls.length, 1);
        assert.equal(req.flash.mock.calls.length, 1);
        assert.deepEqual(req.flash.mock.calls[0].arguments, ['success', 'You have been logged out.']);
        assert.equal(res.redirect.mock.calls.length, 1);
        assert.deepEqual(res.redirect.mock.calls[0].arguments, ['/login']);
    });
});

test('UserController.register', async (t) => {
    beforeEach(() => {
        fakeModels.User.validate.mock.resetCalls();
        fakeModels.User.findOne.mock.resetCalls();
        fakeModels.User.create.mock.resetCalls();
    });

    await t.test('success', async () => {
        const req = {
            body: { email: 'test@example.com', password: 'password123' },
            flash: mock.fn()
        };
        const res = createFakeRes();

        fakeModels.User.validate.mock.mockImplementationOnce(() => ({ error: null }));
        fakeModels.User.findOne.mock.mockImplementationOnce(async () => null);
        fakeModels.User.create.mock.mockImplementationOnce(async () => ({}));

        await UserController.register(req, res);

        assert.equal(fakeModels.User.validate.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.validate.mock.calls[0].arguments[0], req.body);

        assert.equal(fakeModels.User.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.findOne.mock.calls[0].arguments[0], { where: { email: 'test@example.com' } });

        assert.equal(fakeModels.User.create.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.create.mock.calls[0].arguments[0], { email: 'test@example.com', password: 'password123' });

        assert.equal(req.flash.mock.calls.length, 1);
        assert.deepEqual(req.flash.mock.calls[0].arguments, ['success', 'Account created. You may now log in.']);

        assert.equal(res.redirect.mock.calls.length, 1);
        assert.deepEqual(res.redirect.mock.calls[0].arguments, ['/login']);
    });

    await t.test('existing email', async () => {
        const req = {
            body: { email: 'test@example.com', password: 'password123' }
        };
        const res = createFakeRes();

        fakeModels.User.validate.mock.mockImplementationOnce(() => ({ error: null }));
        fakeModels.User.findOne.mock.mockImplementationOnce(async () => ({ id: 1 }));

        await UserController.register(req, res);

        assert.equal(res.render.mock.calls.length, 1);
        assert.deepEqual(res.render.mock.calls[0].arguments, ['register', { error: 'This email is already registered' }]);
        assert.equal(fakeModels.User.create.mock.calls.length, 0);
    });

    await t.test('missing/invalid fields', async () => {
        const req = {
            body: { email: 'invalid' }
        };
        const res = createFakeRes();

        fakeModels.User.validate.mock.mockImplementationOnce(() => ({ error: { message: 'Invalid email' } }));

        await UserController.register(req, res);

        assert.equal(res.render.mock.calls.length, 1);
        assert.deepEqual(res.render.mock.calls[0].arguments, ['register', { error: 'Invalid email' }]);
        assert.equal(fakeModels.User.findOne.mock.calls.length, 0);
        assert.equal(fakeModels.User.create.mock.calls.length, 0);
    });

    await t.test('DB error -> sendStatus(500)', async () => {
        const req = {
            body: { email: 'test@example.com', password: 'password123' }
        };
        const res = createFakeRes();

        fakeModels.User.validate.mock.mockImplementationOnce(() => ({ error: null }));
        fakeModels.User.findOne.mock.mockImplementationOnce(async () => {
            throw new Error('DB Error');
        });

        const originalConsoleLog = console.log;
        console.log = mock.fn();

        await UserController.register(req, res);

        console.log = originalConsoleLog;

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });
});

test('UserController.getForwardUrls', async (t) => {
    beforeEach(() => {
        fakeModels.User.findOne.mock.resetCalls();
    });

    await t.test('success with urls', async () => {
        const req = { user: { id: 1 } };
        const res = createFakeRes();
        const urls = ['http://url1', 'http://url2'];

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => ({ forwardUrls: urls }));

        const originalConsoleLog = console.log;
        console.log = mock.fn();

        await UserController.getForwardUrls(req, res);

        console.log = originalConsoleLog;

        assert.equal(fakeModels.User.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.findOne.mock.calls[0].arguments[0], { where: { id: 1 } });
        assert.equal(res.send.mock.calls.length, 1);
        assert.deepEqual(res.send.mock.calls[0].arguments, [urls]);
    });

    await t.test('success without urls', async () => {
        const req = { user: { id: 1 } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => ({ forwardUrls: null }));

        const originalConsoleLog = console.log;
        console.log = mock.fn();

        await UserController.getForwardUrls(req, res);

        console.log = originalConsoleLog;

        assert.equal(res.send.mock.calls.length, 1);
        assert.deepEqual(res.send.mock.calls[0].arguments, [[]]);
    });

    await t.test('DB error -> sendStatus(500)', async () => {
        const req = { user: { id: 1 } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => {
            throw new Error('DB Error');
        });

        const originalConsoleLog = console.log;
        console.log = mock.fn();

        await UserController.getForwardUrls(req, res);

        console.log = originalConsoleLog;

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });
});

test('UserController.updateForwardUrls', async (t) => {
    beforeEach(() => {
        fakeModels.User.findOne.mock.resetCalls();
    });

    await t.test('success with urls', async () => {
        const req = {
            user: { id: 1 },
            body: { urls: ['http://url1'] }
        };
        const res = createFakeRes();
        const fakeUser = { update: mock.fn(async () => {}) };

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => fakeUser);

        await UserController.updateForwardUrls(req, res);

        assert.equal(fakeModels.User.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.findOne.mock.calls[0].arguments[0], { where: { id: 1 } });

        assert.equal(fakeUser.update.mock.calls.length, 1);
        assert.deepEqual(fakeUser.update.mock.calls[0].arguments[0], { forwardUrls: ['http://url1'] });

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 200);
    });

    await t.test('success without urls', async () => {
        const req = {
            user: { id: 1 },
            body: {}
        };
        const res = createFakeRes();
        const fakeUser = { update: mock.fn(async () => {}) };

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => fakeUser);

        await UserController.updateForwardUrls(req, res);

        assert.equal(fakeUser.update.mock.calls.length, 1);
        assert.deepEqual(fakeUser.update.mock.calls[0].arguments[0], { forwardUrls: null });

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 200);
    });

    await t.test('DB error -> sendStatus(500)', async () => {
        const req = { user: { id: 1 }, body: {} };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => {
            throw new Error('DB Error');
        });

        const originalConsoleLog = console.log;
        console.log = mock.fn();

        await UserController.updateForwardUrls(req, res);

        console.log = originalConsoleLog;

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });
});

test('UserController.getShareId', async (t) => {
    beforeEach(() => {
        fakeModels.User.findOne.mock.resetCalls();
    });

    await t.test('success', async () => {
        const req = { user: { id: 1 } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => ({ shareId: 'test-share-id' }));

        const originalConsoleLog = console.log;
        console.log = mock.fn();

        await UserController.getShareId(req, res);

        console.log = originalConsoleLog;

        assert.equal(fakeModels.User.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.findOne.mock.calls[0].arguments[0], { where: { id: 1 } });

        assert.equal(res.status.mock.calls.length, 1);
        assert.equal(res.status.mock.calls[0].arguments[0], 200);

        assert.equal(res.send.mock.calls.length, 1);
        assert.deepEqual(res.send.mock.calls[0].arguments, ['test-share-id']);
    });

    await t.test('DB error -> sendStatus(500)', async () => {
        const req = { user: { id: 1 } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => {
            throw new Error('DB Error');
        });

        const originalConsoleLog = console.log;
        console.log = mock.fn();

        await UserController.getShareId(req, res);

        console.log = originalConsoleLog;

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });
});

test('UserController.toggleShareId', async (t) => {
    beforeEach(() => {
        fakeModels.User.findOne.mock.resetCalls();
        fakeShortid.generate.mock.resetCalls();
    });

    await t.test('toggles on when shareId is null', async () => {
        const req = { user: { id: 1 } };
        const res = createFakeRes();
        const fakeUser = { update: mock.fn(async () => {}), shareId: null };

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => fakeUser);

        await UserController.toggleShareId(req, res);

        assert.equal(fakeModels.User.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.findOne.mock.calls[0].arguments[0], { where: { id: 1 } });

        assert.equal(fakeUser.update.mock.calls.length, 1);
        assert.deepEqual(fakeUser.update.mock.calls[0].arguments[0], { shareId: 'fake-short-id' });

        assert.equal(fakeShortid.generate.mock.calls.length, 1);

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 200);
    });

    await t.test('toggles off when shareId exists', async () => {
        const req = { user: { id: 1 } };
        const res = createFakeRes();
        const fakeUser = { update: mock.fn(async () => {}), shareId: 'existing-id' };

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => fakeUser);

        await UserController.toggleShareId(req, res);

        assert.equal(fakeUser.update.mock.calls.length, 1);
        assert.deepEqual(fakeUser.update.mock.calls[0].arguments[0], { shareId: null });

        assert.equal(fakeShortid.generate.mock.calls.length, 0);

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 200);
    });

    await t.test('DB error -> sendStatus(500)', async () => {
        const req = { user: { id: 1 } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => {
            throw new Error('DB Error');
        });

        const originalConsoleLog = console.log;
        console.log = mock.fn();

        await UserController.toggleShareId(req, res);

        console.log = originalConsoleLog;

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });
});
