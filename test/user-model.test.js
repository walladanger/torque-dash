const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const Joi = require('joi'); // Real dependency

let userModel;
let fakeBcrypt;
let fakeSequelize;
let fakeDataTypes;
let fakeUserReturn;
let originalResolveFilename;

test('User model tests', async (t) => {
    t.before(() => {
        originalResolveFilename = Module._resolveFilename;
        Module._resolveFilename = function(request, parent, isMain, options) {
            if (request === 'bcrypt') {
                try {
                    return require.resolve('bcrypt');
                } catch (e) {
                    return 'bcrypt_fake_resolved_filename';
                }
            }
            return originalResolveFilename.apply(this, arguments);
        };
    });

    t.after(() => {
        Module._resolveFilename = originalResolveFilename;
    });

    t.beforeEach(() => {
        // Setup fake bcrypt
        fakeBcrypt = {
            genSalt: t.mock.fn(async (rounds) => 'salt'),
            hash: t.mock.fn(async (pw, salt) => 'hashed:' + pw),
            compare: t.mock.fn(async (pw, hash) => pw === 'right')
        };

        // Inject into require.cache
        let bcryptResolve;
        try {
            bcryptResolve = require.resolve('bcrypt');
        } catch (e) {
            bcryptResolve = 'bcrypt_fake_resolved_filename';
        }

        require.cache[bcryptResolve] = {
            id: bcryptResolve,
            filename: bcryptResolve,
            loaded: true,
            exports: fakeBcrypt
        };

        // Setup fake DataTypes
        fakeDataTypes = {
            STRING: 'STRING',
            ARRAY: (t) => ['ARRAY', t]
        };

        // Setup fake Sequelize
        fakeUserReturn = {
            hasMany: t.mock.fn(),
            prototype: {}
        };
        fakeSequelize = {
            define: t.mock.fn((name, attrs, options) => {
                fakeUserReturn.options = options;
                return fakeUserReturn;
            })
        };

        // require the model
        delete require.cache[require.resolve('../models/User.js')];
        userModel = require('../models/User.js')(fakeSequelize, fakeDataTypes);
    });

    t.afterEach(() => {
        let bcryptResolve;
        try {
            bcryptResolve = require.resolve('bcrypt');
        } catch (e) {
            bcryptResolve = 'bcrypt_fake_resolved_filename';
        }
        delete require.cache[bcryptResolve];
    });

    await t.test('define is called correctly', () => {
        assert.equal(fakeSequelize.define.mock.calls.length, 1);
        const [name, attrs, options] = fakeSequelize.define.mock.calls[0].arguments;
        assert.equal(name, 'User');
        assert.equal(attrs.email.type, 'STRING');
        assert.equal(attrs.email.unique, true);
        assert.equal(attrs.email.allowNull, false);
        assert.equal(attrs.password.type, 'STRING');
        assert.equal(attrs.password.allowNull, false);
        assert.equal(attrs.shareId.unique, true);
        assert.deepEqual(attrs.forwardUrls.type, ['ARRAY', 'STRING']);
    });

    await t.test('options.hooks.beforeCreate hashes the password', async () => {
        const beforeCreate = fakeUserReturn.options.hooks.beforeCreate;
        const fakeUser = {
            password: 'pw',
            setDataValue: t.mock.fn()
        };
        await beforeCreate(fakeUser);
        assert.equal(fakeBcrypt.genSalt.mock.calls.length, 1);
        assert.equal(fakeBcrypt.genSalt.mock.calls[0].arguments[0], 8);
        assert.equal(fakeBcrypt.hash.mock.calls.length, 1);
        assert.equal(fakeBcrypt.hash.mock.calls[0].arguments[0], 'pw');
        assert.equal(fakeBcrypt.hash.mock.calls[0].arguments[1], 'salt');
        assert.equal(fakeUser.setDataValue.mock.calls.length, 1);
        assert.equal(fakeUser.setDataValue.mock.calls[0].arguments[0], 'password');
        assert.equal(fakeUser.setDataValue.mock.calls[0].arguments[1], 'hashed:pw');
    });

    await t.test('User.associate calls models.Session via hasMany', () => {
        const models = { Session: 'FakeSession' };
        userModel.associate(models);
        assert.equal(fakeUserReturn.hasMany.mock.calls.length, 1);
        const [model, options] = fakeUserReturn.hasMany.mock.calls[0].arguments;
        assert.equal(model, 'FakeSession');
        assert.equal(options.as, 'Sessions');
        assert.equal(options.foreignKey, 'userId');
        assert.equal(options.onDelete, 'cascade');
    });

    await t.test('User.validate validates correctly', () => {
        const validUser = { email: 'test@example.com', password: 'password123', confirmPassword: 'password123' };
        const { error: noError } = userModel.validate(validUser);
        assert.equal(noError, null);

        const invalidEmailUser = { email: 'invalid', password: 'password123', confirmPassword: 'password123' };
        const { error: emailError } = userModel.validate(invalidEmailUser);
        assert.equal(emailError.message, 'Please provide a valid email.');

        const shortPasswordUser = { email: 'test@example.com', password: 'short', confirmPassword: 'short' };
        const { error: shortError } = userModel.validate(shortPasswordUser);
        assert.ok(shortError);

        const mismatchPasswordUser = { email: 'test@example.com', password: 'password123', confirmPassword: 'password124' };
        const { error: mismatchError } = userModel.validate(mismatchPasswordUser);
        assert.equal(mismatchError.message, 'Passwords do not match.');
    });

    await t.test('prototype.comparePassword works', async () => {
        const userInstance = { password: 'hashed_password', comparePassword: userModel.prototype.comparePassword };
        const resultRight = await userInstance.comparePassword('right');
        assert.equal(resultRight, true);
        assert.equal(fakeBcrypt.compare.mock.calls[0].arguments[0], 'right');
        assert.equal(fakeBcrypt.compare.mock.calls[0].arguments[1], 'hashed_password');

        const resultWrong = await userInstance.comparePassword('wrong');
        assert.equal(resultWrong, false);
    });

});
