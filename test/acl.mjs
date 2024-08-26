import assert from 'assert';
import supertest from 'supertest';
import * as sinon from 'sinon';
import createUwave from './utils/createUwave.mjs';

describe('ACL', () => {
  let user;
  let uw;
  beforeEach(async () => {
    uw = await createUwave('acl');
    user = await uw.test.createUser();

    await uw.acl.createRole('testRole', ['test.perm']);
  });
  afterEach(async () => {
    await uw.destroy();
  });

  it('can check if a user is not allowed to do something', async () => {
    assert.strictEqual(await uw.acl.isAllowed(user, 'test.perm'), false);
  });

  it('disallows nonexistent roles by default', async () => {
    assert.strictEqual(await uw.acl.isAllowed(user, 'something.that.is.not.allowed'), false);
  });

  it('can allow users to do things', async () => {
    assert.strictEqual(await uw.acl.isAllowed(user, 'test.perm'), false);

    await uw.acl.allow(user, ['testRole']);
    assert.strictEqual(await uw.acl.isAllowed(user, 'test.perm'), true);
  });

  it('can create new roles, grouping existing permissions', async () => {
    await uw.acl.createRole('groupOfPermissions', [
      'test.perm',
      'some.other.role',
      'universe.destroy',
      'universe.create',
    ]);
    await uw.acl.createRole('otherGroupOfPermissions', [
      'strawberry.eat',
    ]);

    await uw.acl.allow(user, ['groupOfPermissions']);
    assert.strictEqual(await uw.acl.isAllowed(user, 'universe.create'), true);
  });

  it('can remove permissions from users', async () => {
    await uw.acl.allow(user, ['testRole']);
    assert.strictEqual(await uw.acl.isAllowed(user, 'test.perm'), true);

    await uw.acl.disallow(user, ['testRole']);
    assert.strictEqual(await uw.acl.isAllowed(user, 'test.perm'), false);
  });

  it('can delete roles', async () => {
    await uw.acl.createRole('tempRole', []);
    assert(Object.keys(await uw.acl.getAllRoles()).includes('tempRole'));
    await uw.acl.deleteRole('tempRole');
    assert(!Object.keys(await uw.acl.getAllRoles()).includes('tempRole'));
  });

  describe('GET /roles', () => {
    it('lists available roles', async () => {
      await uw.acl.createRole('testRole2', ['test.permission', 'test.permission2']);

      const res = await supertest(uw.server)
        .get('/api/roles')
        .expect(200);

      sinon.assert.match(res.body.data, {
        'testRole': ['test.perm'],
        'testRole2': ['test.permission', 'test.permission2'],
      });
    });
  });

  describe('PUT /roles/:name', () => {
    it('requires authentication', async () => {
      await supertest(uw.server)
        .put('/api/roles/testRole')
        .send({
          permissions: ['test.permission', 'test.permission2'],
        })
        .expect(401);
    });

    it('requires the acl.create role', async () => {
      const token = await uw.test.createTestSessionToken(user);

      await supertest(uw.server)
        .put('/api/roles/newRole')
        .set('Cookie', `uwsession=${token}`)
        .send({
          permissions: ['test.permission', 'test.permission2'],
        })
        .expect(403);

      await uw.acl.createRole('roleAuthor', ['acl.create']);
      await uw.acl.allow(user, ['roleAuthor']);

      await supertest(uw.server)
        .put('/api/roles/newRole')
        .set('Cookie', `uwsession=${token}`)
        .send({
          permissions: ['test.permission', 'test.permission2'],
        })
        .expect(201);
    });

    it('validates input', async () => {
      const token = await uw.test.createTestSessionToken(user);
      await uw.acl.createRole('roleAuthor', ['acl.create']);
      await uw.acl.allow(user, ['roleAuthor']);

      let res = await supertest(uw.server)
        .put('/api/roles/newRole')
        .set('Cookie', `uwsession=${token}`)
        .send({})
        .expect(400);
      sinon.assert.match(res.body.errors[0], {
        status: 400,
        code: 'validation-error',
      });

      res = await supertest(uw.server)
        .put('/api/roles/newRole')
        .set('Cookie', `uwsession=${token}`)
        .send({ permissions: 'not an array' })
        .expect(400);
      sinon.assert.match(res.body.errors[0], {
        status: 400,
        code: 'validation-error',
      });

      res = await supertest(uw.server)
        .put('/api/roles/newRole')
        .set('Cookie', `uwsession=${token}`)
        .send({ permissions: [{ not: 'a' }, 'string'] })
        .expect(400);
      sinon.assert.match(res.body.errors[0], {
        status: 400,
        code: 'validation-error',
      });
    });

    it('creates a role', async () => {
      const token = await uw.test.createTestSessionToken(user);
      await uw.acl.createRole('roleAuthor', ['acl.create']);
      await uw.acl.allow(user, ['roleAuthor']);

      const res = await supertest(uw.server)
        .put('/api/roles/newRole')
        .set('Cookie', `uwsession=${token}`)
        .send({
          permissions: ['test.permission', 'test.permission2'],
        })
        .expect(201);

      sinon.assert.match(res.body.data, {
        name: 'newRole',
        permissions: ['test.permission', 'test.permission2'],
      });
    });
  });

  describe('DELETE /roles/:name', () => {
    it('requires authentication', async () => {
      await uw.acl.createRole('testRole', []);

      await supertest(uw.server)
        .delete('/api/roles/testRole')
        .expect(401);
    });

    it('requires the acl.delete role', async () => {
      const token = await uw.test.createTestSessionToken(user);

      await uw.acl.createRole('testRole', ['test.permission', 'test.permission2']);

      await supertest(uw.server)
        .delete('/api/roles/testRole')
        .set('Cookie', `uwsession=${token}`)
        .expect(403);

      await uw.acl.createRole('roleDeleter', ['acl.delete']);
      await uw.acl.allow(user, ['roleDeleter']);

      await supertest(uw.server)
        .delete('/api/roles/testRole')
        .set('Cookie', `uwsession=${token}`)
        .expect(200);
    });

    it('deletes the role', async () => {
      const moderator = await uw.test.createUser();
      const token = await uw.test.createTestSessionToken(moderator);

      await uw.acl.createRole('testRole', ['test.permission', 'test.permission2']);
      await uw.acl.createRole('roleDeleter', ['acl.delete']);

      await uw.acl.allow(user, ['testRole']);
      await uw.acl.allow(moderator, ['roleDeleter']);

      assert(await uw.acl.isAllowed(user, 'test.permission2'));

      await supertest(uw.server)
        .delete('/api/roles/testRole')
        .set('Cookie', `uwsession=${token}`)
        .expect(200);

      const res = await supertest(uw.server)
        .get('/api/roles')
        .expect(200);
      assert(!Object.keys(res.body.data).includes('testRole'));

      assert(!await uw.acl.isAllowed(user, 'test.permission2'));
    });
  });
});
