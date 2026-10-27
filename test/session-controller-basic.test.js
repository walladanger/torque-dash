const { test, mock } = require('node:test');
const assert = require('node:assert/strict');

// Setup fakes
const modelsPath = require.resolve('../models');

const fakeModels = {
    User: {
        findOne: mock.fn(async () => {})
    },
    Session: {
        destroy: mock.fn(async () => {}),
        findOne: mock.fn(async () => {}),
        findAll: mock.fn(async () => {}),
        update: mock.fn(async () => {})
    },
    Log: {
        findAll: mock.fn(async () => {})
    },
    Sequelize: {
        Op: {
            notIn: Symbol('notIn'),
            and: Symbol('and'),
            gte: Symbol('gte'),
            lte: Symbol('lte')
        }
    },
    sequelize: {
        transaction: mock.fn(async (cb) => cb())
    }
};

require.cache[modelsPath] = {
    id: modelsPath,
    filename: modelsPath,
    loaded: true,
    exports: fakeModels
};


const SessionController = require('../controllers/SessionController');

function createFakeRes() {
    const res = {
        status: mock.fn(() => res),
        send: mock.fn(() => res),
        sendStatus: mock.fn(() => res),
        json: mock.fn(() => res),
        redirect: mock.fn(() => res),
        render: mock.fn(() => res)
    };
    return res;
}

test('SessionController.delete', async (t) => {
    t.beforeEach(() => {
        fakeModels.Session.destroy.mock.resetCalls();
    });

    await t.test('Success -> resolves to 1, sends status 200', async () => {
        const req = { user: { id: 1 }, params: { sessionId: 2 } };
        const res = createFakeRes();

        fakeModels.Session.destroy.mock.mockImplementationOnce(async () => 1);

        await SessionController.delete(req, res);

        assert.equal(fakeModels.Session.destroy.mock.calls.length, 1);
        assert.deepEqual(fakeModels.Session.destroy.mock.calls[0].arguments[0], { where: { id: 2, userId: 1 } });
        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 200);
    });

    await t.test('Not found -> resolves to 0, sends 401 Session not found', async () => {
        const req = { user: { id: 1 }, params: { sessionId: 2 } };
        const res = createFakeRes();

        fakeModels.Session.destroy.mock.mockImplementationOnce(async () => 0);

        await SessionController.delete(req, res);

        assert.equal(res.status.mock.calls.length, 1);
        assert.equal(res.status.mock.calls[0].arguments[0], 401);
        assert.equal(res.send.mock.calls.length, 1);
        assert.equal(res.send.mock.calls[0].arguments[0], 'Session not found');
    });

    await t.test('Error -> throws error, sends status 500', async () => {
        const req = { user: { id: 1 }, params: { sessionId: 2 } };
        const res = createFakeRes();

        fakeModels.Session.destroy.mock.mockImplementationOnce(async () => {
            throw new Error('DB error');
        });

        mock.method(console, 'log', () => {});
        await SessionController.delete(req, res);
        console.log.mock.restore();

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });
});

test('SessionController.getOne', async (t) => {
    t.beforeEach(() => {
        fakeModels.Session.findOne.mock.resetCalls();
        fakeModels.Log.findAll.mock.resetCalls();
    });

    await t.test('Success -> finds session and adds start/end data, sends session', async () => {
        const req = { user: { id: 1 }, params: { sessionId: 2 } };
        const res = createFakeRes();

        const session = { id: 2, dataValues: {} };
        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => session);

        // addStartEndData asks for the first (ASC) then the last (DESC) log
        const stamps = [1000, 3724000];
        let call = 0;
        fakeModels.Log.findAll.mock.mockImplementation(async () => [{ timestamp: stamps[call++] }]);

        await SessionController.getOne(req, res);

        assert.equal(fakeModels.Session.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.Session.findOne.mock.calls[0].arguments[0].where, { userId: 1, id: 2 });
        assert.equal(fakeModels.Log.findAll.mock.calls.length, 2);

        assert.equal(res.send.mock.calls.length, 1);
        assert.equal(res.send.mock.calls[0].arguments[0], session);
        assert.deepEqual(fakeModels.Log.findAll.mock.calls[0].arguments[0], {
            limit: 1, where: { sessionId: 2 }, order: [['timestamp', 'ASC']]
        });
        assert.deepEqual(fakeModels.Log.findAll.mock.calls[1].arguments[0], {
            limit: 1, where: { sessionId: 2 }, order: [['timestamp', 'DESC']]
        });
        assert.equal(session.dataValues.startDate, 1000);
        assert.equal(session.dataValues.endDate, 3724000);
        // 3723000 ms = 1 h 2 min 3 s
        assert.equal(session.dataValues.duration, '1 hour 02 minutes 03 seconds');
    });

    await t.test('Not found -> resolves null, sends 404 Resource not found', async () => {
        const req = { user: { id: 1 }, params: { sessionId: 2 } };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => null);

        await SessionController.getOne(req, res);

        assert.equal(res.status.mock.calls.length, 1);
        assert.equal(res.status.mock.calls[0].arguments[0], 404);
        assert.equal(res.send.mock.calls.length, 1);
        assert.equal(res.send.mock.calls[0].arguments[0], 'Resource not found');
    });

    await t.test('Error -> throws error, sends status 500', async () => {
        const req = { user: { id: 1 }, params: { sessionId: 2 } };
        const res = createFakeRes();

        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => {
            throw new Error('DB error');
        });

        mock.method(console, 'log', () => {});
        await SessionController.getOne(req, res);
        console.log.mock.restore();

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });
});

test('SessionController.getAll', async (t) => {
    t.beforeEach(() => {
        fakeModels.User.findOne.mock.resetCalls();
        fakeModels.Session.findAll.mock.resetCalls();
        fakeModels.Log.findAll.mock.resetCalls();
    });

    await t.test('Success -> finds user and sessions, adds start/end data, sends sessions', async () => {
        const req = { user: { id: 1 } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => ({ id: 1 }));

        const sessions = [{ id: 2, dataValues: {} }];
        fakeModels.Session.findAll.mock.mockImplementationOnce(async () => sessions);

        fakeModels.Log.findAll.mock.mockImplementation(async () => [{ timestamp: 1000 }]);

        await SessionController.getAll(req, res);

        assert.equal(fakeModels.User.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.findOne.mock.calls[0].arguments[0].where, { id: 1 });
        assert.equal(fakeModels.Session.findAll.mock.calls.length, 1);
        assert.equal(fakeModels.Log.findAll.mock.calls.length, 2);

        assert.equal(res.send.mock.calls.length, 1);
        assert.equal(res.send.mock.calls[0].arguments[0], sessions);
        assert.equal(sessions[0].dataValues.startDate, 1000);
        assert.equal(sessions[0].dataValues.endDate, 1000);
    });

    await t.test('Not found/unauthorized -> resolves null, sends status 401 without body (bug)', async () => {
        const req = { user: { id: 1 } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => null);

        await SessionController.getAll(req, res);

        assert.equal(res.status.mock.calls.length, 1);
        assert.equal(res.status.mock.calls[0].arguments[0], 401);
        assert.equal(res.send.mock.calls.length, 0); // Documents the bug where res.send is missing
        assert.equal(res.sendStatus.mock.calls.length, 0);
    });

    await t.test('Error -> throws error, sends status 500', async () => {
        const req = { user: { id: 1 } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => {
            throw new Error('DB error');
        });

        mock.method(console, 'log', () => {});
        await SessionController.getAll(req, res);
        console.log.mock.restore();

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });
});

test('SessionController.getOneShared', async (t) => {
    t.beforeEach(() => {
        fakeModels.User.findOne.mock.resetCalls();
        fakeModels.Session.findOne.mock.resetCalls();
        fakeModels.Log.findAll.mock.resetCalls();
    });

    await t.test('Success -> finds user and session, adds start/end data, sends session', async () => {
        const req = { params: { shareId: 'share1', sessionId: 2 } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => ({ id: 1 }));

        const session = { id: 2, dataValues: {} };
        fakeModels.Session.findOne.mock.mockImplementationOnce(async () => session);

        fakeModels.Log.findAll.mock.mockImplementation(async () => [{ timestamp: 1000 }]);

        await SessionController.getOneShared(req, res);

        assert.equal(fakeModels.User.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.findOne.mock.calls[0].arguments[0].where, { shareId: 'share1' });
        assert.equal(fakeModels.Session.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.Session.findOne.mock.calls[0].arguments[0].where, { userId: 1, id: 2 });
        assert.equal(fakeModels.Log.findAll.mock.calls.length, 2);

        assert.equal(res.send.mock.calls.length, 1);
        assert.equal(res.send.mock.calls[0].arguments[0], session);
    });

    await t.test('Wrong owner/Not found user -> resolves null, sends status 404', async () => {
        const req = { params: { shareId: 'share1', sessionId: 2 } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => null);

        await SessionController.getOneShared(req, res);

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 404);
    });

    await t.test('Error -> throws error, sends status 500', async () => {
        const req = { params: { shareId: 'share1', sessionId: 2 } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => {
            throw new Error('DB error');
        });

        mock.method(console, 'log', () => {});
        await SessionController.getOneShared(req, res);
        console.log.mock.restore();

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });
});

test('SessionController.getAllShared', async (t) => {
    t.beforeEach(() => {
        fakeModels.User.findOne.mock.resetCalls();
        fakeModels.Session.findAll.mock.resetCalls();
        fakeModels.Log.findAll.mock.resetCalls();
    });

    await t.test('Success -> finds user and sessions, adds start/end data, sends sessions', async () => {
        const req = { params: { shareId: 'share1' } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => ({ id: 1 }));

        const sessions = [{ id: 2, dataValues: {} }];
        fakeModels.Session.findAll.mock.mockImplementationOnce(async () => sessions);

        fakeModels.Log.findAll.mock.mockImplementation(async () => [{ timestamp: 1000 }]);

        await SessionController.getAllShared(req, res);

        assert.equal(fakeModels.User.findOne.mock.calls.length, 1);
        assert.deepEqual(fakeModels.User.findOne.mock.calls[0].arguments[0].where, { shareId: 'share1' });
        assert.equal(fakeModels.Session.findAll.mock.calls.length, 1);
        assert.deepEqual(fakeModels.Session.findAll.mock.calls[0].arguments[0].where, { userId: 1 });
        assert.equal(fakeModels.Log.findAll.mock.calls.length, 2);

        assert.equal(res.send.mock.calls.length, 1);
        assert.equal(res.send.mock.calls[0].arguments[0], sessions);
    });

    await t.test('Not found -> resolves null user, sends status 404', async () => {
        const req = { params: { shareId: 'share1' } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => null);

        await SessionController.getAllShared(req, res);

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 404);
    });

    await t.test('Error -> throws error, sends status 500', async () => {
        const req = { params: { shareId: 'share1' } };
        const res = createFakeRes();

        fakeModels.User.findOne.mock.mockImplementationOnce(async () => {
            throw new Error('DB error');
        });

        mock.method(console, 'log', () => {});
        await SessionController.getAllShared(req, res);
        console.log.mock.restore();

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });
});

test('SessionController.rename', async (t) => {
    t.beforeEach(() => {
        fakeModels.Session.update.mock.resetCalls();
    });

    await t.test('Success -> resolves, sends status 200', async () => {
        const req = { user: { id: 1 }, params: { sessionId: 2 }, body: { name: 'NewName' } };
        const res = createFakeRes();

        fakeModels.Session.update.mock.mockImplementationOnce(async () => [1]);

        await SessionController.rename(req, res);

        assert.equal(fakeModels.Session.update.mock.calls.length, 1);
        assert.deepEqual(fakeModels.Session.update.mock.calls[0].arguments[0], { name: 'NewName' });
        assert.deepEqual(fakeModels.Session.update.mock.calls[0].arguments[1], { where: { id: 2, userId: 1 } });

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 200);
    });

    await t.test('Error -> throws error, sends status 500', async () => {
        const req = { user: { id: 1 }, params: { sessionId: 2 }, body: { name: 'NewName' } };
        const res = createFakeRes();

        fakeModels.Session.update.mock.mockImplementationOnce(async () => {
            throw new Error('DB error');
        });

        mock.method(console, 'log', () => {});
        await SessionController.rename(req, res);
        console.log.mock.restore();

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });
});

test('SessionController.addLocation', async (t) => {
    t.beforeEach(() => {
        fakeModels.Session.update.mock.resetCalls();
    });

    await t.test('Success -> resolves, sends status 200', async () => {
        const req = {
            user: { id: 1 },
            params: { sessionId: 2 },
            body: { locations: { start: 'StartLoc', end: 'EndLoc' } }
        };
        const res = createFakeRes();

        fakeModels.Session.update.mock.mockImplementationOnce(async () => [1]);

        await SessionController.addLocation(req, res);

        assert.equal(fakeModels.Session.update.mock.calls.length, 1);
        assert.deepEqual(fakeModels.Session.update.mock.calls[0].arguments[0], { startLocation: 'StartLoc', endLocation: 'EndLoc' });
        assert.deepEqual(fakeModels.Session.update.mock.calls[0].arguments[1], { where: { id: 2, userId: 1 } });

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 200);
    });

    await t.test('Error -> throws error, sends status 500', async () => {
        const req = {
            user: { id: 1 },
            params: { sessionId: 2 },
            body: { locations: { start: 'StartLoc', end: 'EndLoc' } }
        };
        const res = createFakeRes();

        fakeModels.Session.update.mock.mockImplementationOnce(async () => {
            throw new Error('DB error');
        });

        mock.method(console, 'log', () => {});
        await SessionController.addLocation(req, res);
        console.log.mock.restore();

        assert.equal(res.sendStatus.mock.calls.length, 1);
        assert.equal(res.sendStatus.mock.calls[0].arguments[0], 500);
    });
});
