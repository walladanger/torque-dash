const { test, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Setup fakes
const modelsPath = require.resolve('../models');
const passportLocalPath = require.resolve('passport-local');

const fakeModels = {
    User: {
        findOne: mock.fn(async () => {}),
        findByPk: mock.fn(async () => {})
    }
};

function FakeLocalStrategy(options, verify) {
    this.options = options;
    this.verify = verify;
}
const fakeLocalStrategy = mock.fn(FakeLocalStrategy);

require.cache[modelsPath] = {
    id: modelsPath,
    filename: modelsPath,
    loaded: true,
    exports: { User: fakeModels.User }
};

require.cache[passportLocalPath] = {
    id: passportLocalPath,
    filename: passportLocalPath,
    loaded: true,
    exports: fakeLocalStrategy
};

const passportConfig = require('../config/passport');

test('passport config', async (t) => {
    let fakePassport;
    let strategyVerify;
    let serializeCb;
    let deserializeCb;

    beforeEach(() => {
        fakeModels.User.findOne.mock.resetCalls();
        fakeModels.User.findByPk.mock.resetCalls();
        fakeLocalStrategy.mock.resetCalls();

        fakePassport = {
            use: mock.fn(),
            serializeUser: mock.fn(),
            deserializeUser: mock.fn()
        };

        passportConfig(fakePassport);

        const strategyInstance = fakePassport.use.mock.calls[0].arguments[0];
        strategyVerify = strategyInstance.verify;
        serializeCb = fakePassport.serializeUser.mock.calls[0].arguments[0];
        deserializeCb = fakePassport.deserializeUser.mock.calls[0].arguments[0];
    });

    await t.test('registers LocalStrategy with usernameField and verify callback', () => {
        assert.equal(fakeLocalStrategy.mock.calls.length, 1);
        assert.deepEqual(fakeLocalStrategy.mock.calls[0].arguments[0], { usernameField: 'email' });
        assert.equal(typeof fakeLocalStrategy.mock.calls[0].arguments[1], 'function');

        assert.equal(fakePassport.use.mock.calls.length, 1);
        const strategyInstance = fakePassport.use.mock.calls[0].arguments[0];
        assert.deepEqual(strategyInstance.options, { usernameField: 'email' });
        assert.equal(typeof strategyInstance.verify, 'function');
    });

    await t.test('verify callback - unknown email', async () => {
        fakeModels.User.findOne.mock.mockImplementation(async () => null);
        const done = mock.fn();
        await strategyVerify('unknown@test.com', 'pass', done);

        assert.equal(fakeModels.User.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.findOne.mock.calls[0].arguments[0], { where: { email: 'unknown@test.com' } });
        assert.equal(done.mock.calls.length, 1);
        assert.deepEqual(done.mock.calls[0].arguments, [null, false, { message: 'Incorrect username or password.' }]);
    });

    await t.test('verify callback - wrong password', async () => {
        const comparePasswordMock = mock.fn(async (password) => false);
        const fakeUser = {
            comparePassword: comparePasswordMock
        };
        fakeModels.User.findOne.mock.mockImplementation(async () => fakeUser);
        const done = mock.fn();
        await strategyVerify('user@test.com', 'wrong', done);

        assert.equal(fakeModels.User.findOne.mock.calls.length, 1);
        assert.equal(comparePasswordMock.mock.calls.length, 1);
        assert.equal(comparePasswordMock.mock.calls[0].arguments[0], 'wrong');
        assert.equal(done.mock.calls.length, 1);
        assert.deepEqual(done.mock.calls[0].arguments, [null, false, { message: 'Incorrect username or password.' }]);
    });

    await t.test('verify callback - correct password', async () => {
        const comparePasswordMock = mock.fn(async (password) => password === 'correct');
        const fakeUser = {
            id: 1,
            email: 'user@test.com',
            comparePassword: comparePasswordMock
        };
        fakeModels.User.findOne.mock.mockImplementation(async () => fakeUser);
        const done = mock.fn();
        await strategyVerify('user@test.com', 'correct', done);

        assert.equal(fakeModels.User.findOne.mock.calls.length, 1);
        assert.equal(comparePasswordMock.mock.calls.length, 1);
        assert.equal(comparePasswordMock.mock.calls[0].arguments[0], 'correct');
        assert.equal(done.mock.calls.length, 1);
        assert.deepEqual(done.mock.calls[0].arguments, [null, fakeUser]);
    });

    await t.test('verify callback - DB error', async () => {
        const dbError = new Error('DB failed');
        fakeModels.User.findOne.mock.mockImplementation(async () => { throw dbError; });

        // Suppress console.log output during this test case to keep test output clean
        const originalConsoleLog = console.log;
        console.log = mock.fn();

        const done = mock.fn();
        await strategyVerify('user@test.com', 'pass', done);

        console.log = originalConsoleLog;

        assert.equal(fakeModels.User.findOne.mock.calls.length, 1);
        assert.equal(done.mock.calls.length, 1);
        assert.deepEqual(done.mock.calls[0].arguments, [dbError, false]);
    });

    await t.test('serializeUser callback', () => {
        const fakeUser = { id: 456 };
        const done = mock.fn();
        serializeCb(fakeUser, done);

        assert.equal(done.mock.calls.length, 1);
        assert.deepEqual(done.mock.calls[0].arguments, [null, 456]);
    });

    await t.test('deserializeUser callback - user found', async () => {
        const rawUser = { id: 789, email: 'found@test.com' };
        const fakeUser = {
            get: () => rawUser
        };
        fakeModels.User.findByPk.mock.mockImplementation(async () => fakeUser);
        const done = mock.fn();
        await deserializeCb(789, done);

        assert.equal(fakeModels.User.findByPk.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.findByPk.mock.calls[0].arguments, [789]);
        assert.equal(done.mock.calls.length, 1);
        assert.deepEqual(done.mock.calls[0].arguments, [null, rawUser]);
    });

    await t.test('deserializeUser callback - user not found', async () => {
        fakeModels.User.findByPk.mock.mockImplementation(async () => null);
        const done = mock.fn();
        await deserializeCb(999, done);

        assert.equal(fakeModels.User.findByPk.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.findByPk.mock.calls[0].arguments, [999]);
        assert.equal(done.mock.calls.length, 1);
        assert.deepEqual(done.mock.calls[0].arguments, [null, false]);
    });

    await t.test('deserializeUser callback - DB error', async () => {
        const dbError = new Error('DB deserialization failed');
        fakeModels.User.findByPk.mock.mockImplementation(async () => { throw dbError; });

        const originalConsoleLog = console.log;
        console.log = mock.fn();

        const done = mock.fn();
        await deserializeCb(789, done);

        console.log = originalConsoleLog;

        assert.equal(fakeModels.User.findByPk.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.findByPk.mock.calls[0].arguments, [789]);
        assert.equal(done.mock.calls.length, 1);
        assert.deepEqual(done.mock.calls[0].arguments, [dbError, false]);
    });
});
