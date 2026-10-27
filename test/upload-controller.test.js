const { test, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const moment = require('moment');

// Setup fakes
const modelsPath = require.resolve('../models');
const requestPath = require.resolve('request');

const fakeModels = {
    User: {
        findOne: mock.fn(async () => {})
    },
    Session: {
        findOrCreate: mock.fn(async () => {})
    },
    Log: {
        findOne: mock.fn(async () => {}),
        create: mock.fn(async () => {})
    }
};

const fakeRequest = mock.fn();

require.cache[modelsPath] = {
    id: modelsPath,
    filename: modelsPath,
    loaded: true,
    exports: fakeModels
};

require.cache[requestPath] = {
    id: requestPath,
    filename: requestPath,
    loaded: true,
    exports: fakeRequest
};

const UploadController = require('../controllers/UploadController');

function createFakeRes() {
    const res = {
        status: mock.fn(() => res),
        send: mock.fn(() => res),
        sendStatus: mock.fn(() => res)
    };
    return res;
}

test('UploadController.processUpload', async (t) => {
    beforeEach(() => {
        fakeModels.User.findOne.mock.resetCalls();
        fakeModels.Session.findOrCreate.mock.resetCalls();
        fakeModels.Log.findOne.mock.resetCalls();
        fakeModels.Log.create.mock.resetCalls();
        fakeRequest.mock.resetCalls();
    });

    await t.test('Missing kff1005 or kff1006 -> status 200 "OK!" and no DB calls', async () => {
        const req = { query: { eml: 'test@test.com', session: '123', time: '1234567890' } };
        const res = createFakeRes();

        await UploadController.processUpload(req, res);

        assert.equal(res.status.mock.calls.length, 1);
        assert.equal(res.status.mock.calls[0].arguments[0], 200);
        assert.equal(res.send.mock.calls.length, 1);
        assert.equal(res.send.mock.calls[0].arguments[0], 'OK!');

        assert.equal(fakeModels.User.findOne.mock.calls.length, 0);
    });

    await t.test('Array lon/lat values -> the first element is stored as lon/lat', async () => {
        const req = { query: { eml: 'test@test.com', session: '123', time: '1234567890', kff1005: ['1.23', '4.56'], kff1006: ['7.89', '0.12'] } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => ({ id: 1 }));
        fakeModels.Session.findOrCreate.mock.mockImplementationOnce(async () => [{ dataValues: { id: 2 } }]);
        fakeModels.Log.findOne.mock.mockImplementationOnce(async () => null); // No duplicate
        fakeModels.Log.create.mock.mockImplementationOnce(async () => ({ id: 3 })); // Success

        await UploadController.processUpload(req, res);

        assert.equal(fakeModels.Log.create.mock.calls.length, 1);
        assert.equal(fakeModels.Log.create.mock.calls[0].arguments[0].lon, '1.23');
        assert.equal(fakeModels.Log.create.mock.calls[0].arguments[0].lat, '7.89');
    });

    await t.test('Unknown user (User.findOne resolves null) -> 403 "Invalid user account."; findOne was called with { where: { email: eml } }', async () => {
        const req = { query: { eml: 'unknown@test.com', session: '123', time: '1234567890', kff1005: '1.23', kff1006: '4.56' } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => null);

        await UploadController.processUpload(req, res);

        assert.equal(res.status.mock.calls.length, 1);
        assert.equal(res.status.mock.calls[0].arguments[0], 403);
        assert.equal(res.send.mock.calls.length, 1);
        assert.equal(res.send.mock.calls[0].arguments[0], 'Invalid user account.');

        assert.equal(fakeModels.User.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.findOne.mock.calls[0].arguments[0], { where: { email: 'unknown@test.com' } });
    });

    await t.test('user.forwardUrls -> request called once per URL; a request stub that throws does not stop processing', async () => {
        const req = { query: { eml: 'test@test.com', session: '123', time: '1234567890', kff1005: '1.23', kff1006: '4.56' } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => ({
            id: 1,
            forwardUrls: ['http://url1.com', 'http://url2.com']
        }));
        fakeModels.Session.findOrCreate.mock.mockImplementationOnce(async () => [{ dataValues: { id: 2 } }]);
        fakeModels.Log.findOne.mock.mockImplementationOnce(async () => null); // No duplicate
        fakeModels.Log.create.mock.mockImplementationOnce(async () => ({ id: 3 })); // Success

        fakeRequest.mock.mockImplementationOnce(() => {
            throw new Error('request error');
        });
        fakeRequest.mock.mockImplementationOnce(() => {});

        const originalConsoleLog = console.log;
        console.log = mock.fn();

        await UploadController.processUpload(req, res);

        console.log = originalConsoleLog;

        assert.equal(fakeRequest.mock.calls.length, 2);
        assert.deepEqual(fakeRequest.mock.calls[0].arguments[0], {
            method: 'GET',
            url: 'http://url1.com',
            qs: req.query,
            headers: {}
        });
        assert.deepEqual(fakeRequest.mock.calls[1].arguments[0], {
            method: 'GET',
            url: 'http://url2.com',
            qs: req.query,
            headers: {}
        });

        // Ensure process continued
        assert.equal(fakeModels.Log.create.mock.calls.length, 1);
        assert.equal(res.status.mock.calls[0].arguments[0], 200);
    });

    await t.test('Duplicate timestamp (Log.findOne resolves an object) -> 403 "Duplicate entry." and Log.create not called', async () => {
        const time = '1234567890';
        const expectedTimestamp = moment(time, 'x').format('YYYY-MM-DD HH:mm:ss');
        const req = { query: { eml: 'test@test.com', session: '123', time: time, kff1005: '1.23', kff1006: '4.56' } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => ({ id: 1 }));
        fakeModels.Session.findOrCreate.mock.mockImplementationOnce(async () => [{ dataValues: { id: 2 } }]);
        fakeModels.Log.findOne.mock.mockImplementationOnce(async () => ({ id: 10 })); // Duplicate exists

        await UploadController.processUpload(req, res);

        assert.equal(res.status.mock.calls.length, 1);
        assert.equal(res.status.mock.calls[0].arguments[0], 403);
        assert.equal(res.send.mock.calls.length, 1);
        assert.equal(res.send.mock.calls[0].arguments[0], 'Duplicate entry.');

        assert.equal(fakeModels.Log.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.Log.findOne.mock.calls[0].arguments[0].where, {
            sessionId: 2,
            timestamp: expectedTimestamp
        });

        assert.equal(fakeModels.Log.create.mock.calls.length, 0);
    });

    await t.test('Happy path -> Log.create called with correct args; response 200 "OK!"', async () => {
        const time = '1234567890';
        const expectedTimestamp = moment(time, 'x').format('YYYY-MM-DD HH:mm:ss');
        const req = {
            query: {
                eml: 'test@test.com', v: '1', session: '123', id: 'abc', time: time, kff1005: '1.23', kff1006: '4.56',
                kff1234: '7.89' // extra value
            }
        };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => ({ id: 1 }));
        fakeModels.Session.findOrCreate.mock.mockImplementationOnce(async () => [{ dataValues: { id: 2 } }]);
        fakeModels.Log.findOne.mock.mockImplementationOnce(async () => null); // No duplicate
        fakeModels.Log.create.mock.mockImplementationOnce(async () => ({ id: 3 })); // Success

        await UploadController.processUpload(req, res);

        assert.equal(res.status.mock.calls.length, 1);
        assert.equal(res.status.mock.calls[0].arguments[0], 200);
        assert.equal(res.send.mock.calls.length, 1);
        assert.equal(res.send.mock.calls[0].arguments[0], 'OK!');

        assert.equal(fakeModels.Log.create.mock.calls.length, 1);
        assert.deepEqual(fakeModels.Log.create.mock.calls[0].arguments[0], {
            sessionId: 2,
            timestamp: expectedTimestamp,
            lon: '1.23',
            lat: '4.56',
            values: { kff1234: '7.89' } // Omitted eml, v, session, id, time, kff1005, kff1006
        });
    });

    await t.test('A stub that throws -> sendStatus(500)', async () => {
        const req = { query: { eml: 'test@test.com', session: '123', time: '1234567890', kff1005: '1.23', kff1006: '4.56' } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => {
            throw new Error('DB Error');
        });

        const originalConsoleLog = console.log;
        console.log = mock.fn();

        await UploadController.processUpload(req, res);

        console.log = originalConsoleLog;

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });
});
