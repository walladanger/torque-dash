const { test, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Setup fakes
const modelsPath = require.resolve('../models');
const shortidPath = require.resolve('shortid');

const Op = {
    notIn: Symbol('notIn'),
    and: Symbol('and'),
    gte: Symbol('gte'),
    lte: Symbol('lte')
};

const fakeModels = {
    Session: {
        findOne: mock.fn(async () => {}),
        create: mock.fn(async () => {})
    },
    Log: {
        create: mock.fn(async () => {}),
        destroy: mock.fn(async () => {})
    },
    sequelize: {
        transaction: mock.fn(async (cb) => { return await cb(); })
    },
    Sequelize: { Op }
};

const fakeShortid = {
    generate: mock.fn(() => 'mocked-shortid')
};

require.cache[modelsPath] = {
    id: modelsPath,
    filename: modelsPath,
    loaded: true,
    exports: fakeModels
};

require.cache[shortidPath] = {
    id: shortidPath,
    filename: shortidPath,
    loaded: true,
    exports: fakeShortid
};

const SessionController = require('../controllers/SessionController');

function createFakeRes() {
    return {
        status: mock.fn(function() { return this; }),
        send: mock.fn(function() { return this; }),
        sendStatus: mock.fn(function() { return this; })
    };
}

const originalConsoleLog = console.log;

test('SessionController edit methods (copy, filter, cut, join)', async (t) => {
    beforeEach(() => {
        fakeModels.Session.findOne.mock.resetCalls();
        fakeModels.Session.create.mock.resetCalls();
        fakeModels.Log.create.mock.resetCalls();
        fakeModels.Log.destroy.mock.resetCalls();
        fakeShortid.generate.mock.resetCalls();

        console.log = mock.fn();
    });

    afterEach(() => {
        console.log = originalConsoleLog;
    });

    await t.test('copy - success', async () => {
        const req = {
            user: { id: 10 },
            params: { sessionId: 'sid1' },
            body: { name: 'copied session' }
        };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => ({
            startLocation: 'start',
            endLocation: 'end',
            userId: 10,
            Logs: [
                { dataValues: { timestamp: 100, lon: 1.1, lat: 2.2, values: { rpm: 1000 } } },
                { dataValues: { timestamp: 101, lon: 1.2, lat: 2.3, values: { rpm: 2000 } } }
            ]
        }));

        fakeModels.Session.create.mock.mockImplementationOnce(async () => ({ id: 99 }));

        await SessionController.copy(req, res);

        assert.equal(fakeModels.Session.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.Session.findOne.mock.calls[0].arguments[0], {
            where: { userId: 10, id: 'sid1' },
            include: { all: true }
        });

        assert.equal(fakeModels.Session.create.mock.calls.length, 1);
        assert.deepEqual(fakeModels.Session.create.mock.calls[0].arguments[0], {
            sessionId: 'mocked-shortid',
            name: 'copied session',
            startLocation: 'start',
            endLocation: 'end',
            userId: 10
        });

        assert.equal(fakeModels.Log.create.mock.calls.length, 2);
        assert.deepEqual(fakeModels.Log.create.mock.calls[0].arguments[0], {
            sessionId: 99, timestamp: 100, lon: 1.1, lat: 2.2, values: { rpm: 1000 }
        });
        assert.deepEqual(fakeModels.Log.create.mock.calls[1].arguments[0], {
            sessionId: 99, timestamp: 101, lon: 1.2, lat: 2.3, values: { rpm: 2000 }
        });

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 200);
    });

    await t.test('copy - session not found (throws TypeError due to bug) -> 500', async () => {
        const req = { user: { id: 10 }, params: { sessionId: 'sid1' }, body: { name: 'copied' } };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => null);

        await SessionController.copy(req, res);

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });

    await t.test('copy - outer DB error -> 500', async () => {
        const req = { user: { id: 10 }, params: { sessionId: 'sid1' }, body: { name: 'copied' } };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => {
            throw new Error('DB error');
        });

        await SessionController.copy(req, res);

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });

    await t.test('copy - inner Log.create error -> multiple 500s', async () => {
        const req = { user: { id: 10 }, params: { sessionId: 'sid1' }, body: { name: 'copied' } };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => ({
            startLocation: 'start', endLocation: 'end', userId: 10,
            Logs: [
                { dataValues: { timestamp: 100, lon: 1.1, lat: 2.2, values: {} } },
                { dataValues: { timestamp: 101, lon: 1.2, lat: 2.3, values: {} } }
            ]
        }));

        fakeModels.Session.create.mock.mockImplementationOnce(async () => ({ id: 99 }));

        fakeModels.Log.create.mock.mockImplementationOnce(async () => {
            throw new Error('Log DB error');
        });
        fakeModels.Log.create.mock.mockImplementationOnce(async () => {
            throw new Error('Log DB error');
        });
        fakeModels.Log.create.mock.mockImplementationOnce(async () => {
            throw new Error('Log DB error');
        });
        fakeModels.Log.create.mock.mockImplementationOnce(async () => {
            throw new Error('Log DB error');
        });

        await SessionController.copy(req, res);

        assert.equal(res.sendStatus.mock.calls.length, 2);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
        assert.equal(res.sendStatus.mock.calls[1].arguments[0], 200);

    });

    await t.test('filter - success', async () => {
        const req = {
            user: { id: 10 },
            params: { sessionId: 5 },
            body: { filterNumber: 2 }
        };
        const res = createFakeRes();

        const fakeSession = {
            id: 5,
            getLogs: mock.fn(async () => [
                { id: 101 }, { id: 102 }, { id: 103 }, { id: 104 }
            ])
        };
        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => fakeSession);

        await SessionController.filter(req, res);

        assert.equal(fakeModels.Session.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.Session.findOne.mock.calls[0].arguments[0], {
            where: { id: 5, userId: 10 }
        });

        assert.equal(fakeSession.getLogs.mock.calls.length, 1);
        assert.deepEqual(fakeSession.getLogs.mock.calls[0].arguments[0], { raw: true });

        assert.equal(fakeModels.Log.destroy.mock.calls.length, 1);
        assert.deepEqual(fakeModels.Log.destroy.mock.calls[0].arguments[0], {
            where: {
                sessionId: 5,
                id: { [Op.notIn]: [102, 104] }
            }
        });

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 200);
    });

    await t.test('filter - filterNumber > logs.length -> 200 without destroy', async () => {
        const req = {
            user: { id: 10 },
            params: { sessionId: 5 },
            body: { filterNumber: 5 }
        };
        const res = createFakeRes();

        const fakeSession = {
            id: 5,
            getLogs: mock.fn(async () => [ { id: 101 }, { id: 102 } ])
        };
        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => fakeSession);

        await SessionController.filter(req, res);

        assert.equal(fakeModels.Log.destroy.mock.calls.length, 0);
        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 200);
    });

    await t.test('filter - session not found -> 404', async () => {
        const req = { user: { id: 10 }, params: { sessionId: 5 }, body: { filterNumber: 2 } };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => null);

        await SessionController.filter(req, res);

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 404);
    });

    await t.test('filter - DB error -> 500', async () => {
        const req = { user: { id: 10 }, params: { sessionId: 5 }, body: { filterNumber: 2 } };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => {
            throw new Error('DB Error');
        });

        await SessionController.filter(req, res);

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });

    await t.test('cut - success', async () => {
        const req = {
            user: { id: 10 },
            params: { sessionId: 7 },
            body: { from: 1000, to: 2000 }
        };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => ({ id: 7 }));

        await SessionController.cut(req, res);

        assert.equal(fakeModels.Session.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.Session.findOne.mock.calls[0].arguments[0], {
            where: { id: 7, userId: 10 }
        });

        assert.equal(fakeModels.Log.destroy.mock.calls.length, 1);
        assert.deepEqual(fakeModels.Log.destroy.mock.calls[0].arguments[0], {
            where: {
                sessionId: 7,
                timestamp: {
                    [Op.and]: {
                        [Op.gte]: 1000,
                        [Op.lte]: 2000
                    }
                }
            }
        });

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 200);
    });

    await t.test('cut - session not found -> 404', async () => {
        const req = { user: { id: 10 }, params: { sessionId: 7 }, body: { from: 1000, to: 2000 } };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => null);

        await SessionController.cut(req, res);

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 404);
    });

    await t.test('cut - DB error -> 500', async () => {
        const req = { user: { id: 10 }, params: { sessionId: 7 }, body: { from: 1000, to: 2000 } };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => {
            throw new Error('DB Error');
        });

        await SessionController.cut(req, res);

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });

    await t.test('join - success', async () => {
        const req = {
            user: { id: 10 },
            params: { sessionId: 8 },
            body: { joinSessionId: 9, name: 'joined session' }
        };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementation(async (args) => {
            if (args.where.id === 8) return { id: 8, Logs: [ { dataValues: { timestamp: 100, lon: 1, lat: 2, values: { a: 1 } } } ] };
            if (args.where.id === 9) return { id: 9, Logs: [ { dataValues: { timestamp: 200, lon: 3, lat: 4, values: { b: 2 } } } ] };
            return null;
        });

        fakeModels.Session.create.mock.mockImplementationOnce(async () => ({ id: 89 }));

        await SessionController.join(req, res);

        assert.equal(fakeModels.Session.findOne.mock.calls.length, 2);
        assert.deepEqual(fakeModels.Session.findOne.mock.calls[0].arguments[0], {
            where: { id: 8, userId: 10 },
            include: { all: true }
        });
        assert.deepEqual(fakeModels.Session.findOne.mock.calls[1].arguments[0], {
            where: { id: 9, userId: 10 },
            include: { all: true }
        });

        assert.equal(fakeModels.Session.create.mock.calls.length, 1);
        assert.deepEqual(fakeModels.Session.create.mock.calls[0].arguments[0], {
            sessionId: 'mocked-shortid',
            name: 'joined session',
            userId: 10
        });

        assert.equal(fakeModels.Log.create.mock.calls.length, 2);
        assert.deepEqual(fakeModels.Log.create.mock.calls[0].arguments[0], {
            sessionId: 89, timestamp: 100, lon: 1, lat: 2, values: { a: 1 }
        });
        assert.deepEqual(fakeModels.Log.create.mock.calls[1].arguments[0], {
            sessionId: 89, timestamp: 200, lon: 3, lat: 4, values: { b: 2 }
        });

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 200);
    });

    await t.test('join - sessionOne missing -> 404', async () => {
        const req = { user: { id: 10 }, params: { sessionId: 8 }, body: { joinSessionId: 9, name: 'joined' } };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementation(async (args) => {
            if (args.where.id === 9) return { id: 9, Logs: [] };
            return null;
        });

        await SessionController.join(req, res);

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 404);
    });

    await t.test('join - sessionTwo missing -> 404', async () => {
        const req = { user: { id: 10 }, params: { sessionId: 8 }, body: { joinSessionId: 9, name: 'joined' } };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementation(async (args) => {
            if (args.where.id === 8) return { id: 8, Logs: [] };
            return null;
        });

        await SessionController.join(req, res);

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 404);
    });

    await t.test('join - DB error -> 500', async () => {
        const req = { user: { id: 10 }, params: { sessionId: 8 }, body: { joinSessionId: 9, name: 'joined' } };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => {
            throw new Error('DB Error');
        });

        await SessionController.join(req, res);

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });

    await t.test('join - inner Log.create error -> multiple 500s', async () => {
        const req = { user: { id: 10 }, params: { sessionId: 8 }, body: { joinSessionId: 9, name: 'joined' } };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementation(async (args) => {
            if (args.where.id === 8) return { id: 8, Logs: [ { dataValues: { timestamp: 100, lon: 1, lat: 2, values: {} } } ] };
            if (args.where.id === 9) return { id: 9, Logs: [ { dataValues: { timestamp: 200, lon: 3, lat: 4, values: {} } } ] };
            return null;
        });

        fakeModels.Session.create.mock.mockImplementationOnce(async () => ({ id: 89 }));

        fakeModels.Log.create.mock.mockImplementationOnce(async () => {
            throw new Error('Log DB error');
        });
        fakeModels.Log.create.mock.mockImplementationOnce(async () => {
            throw new Error('Log DB error');
        });
        fakeModels.Log.create.mock.mockImplementationOnce(async () => {
            throw new Error('Log DB error');
        });
        fakeModels.Log.create.mock.mockImplementationOnce(async () => {
            throw new Error('Log DB error');
        });

        await SessionController.join(req, res);

        assert.equal(res.sendStatus.mock.calls.length, 2);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
        assert.equal(res.sendStatus.mock.calls[1].arguments[0], 200);

    });
});
