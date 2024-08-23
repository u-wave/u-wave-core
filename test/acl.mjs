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

    await uw.acl.createRole('test.role', []);
  });
  afterEach(async () => {
    await uw.destroy();
  });

  it('can check if a user is not allowed to do something', async () => {
    assert.strictEqual(await uw.acl.isAllowed(user, 'test.role'), false);
  });

  it('disallows nonexistent roles by default', async () => {
    assert.strictEqual(await uw.acl.isAllowed(user, 'something.that.is.not.allowed'), false);
  });

  it('can allow users to do things', async () => {
    assert.strictEqual(await uw.acl.isAllowed(user, 'test.role'), false);

    await uw.acl.allow(user, ['test.role']);
    assert.strictEqual(await uw.acl.isAllowed(user, 'test.role'), true);
  });

  it('can create new roles, grouping existing roles', async () => {
    await uw.acl.createRole('group.of.roles', [
      'test.role',
      'some.other.role',
      'universe.destroy',
      'universe.create',
    ]);
    await uw.acl.createRole('other.group.of.roles', [
      'strawberry.eat',
    ]);

    await uw.acl.allow(user, ['group.of.roles']);
    assert.strictEqual(await uw.acl.isAllowed(user, 'universe.create'), true);
  });

  it('can remove permissions from users', async () => {
    await uw.acl.allow(user, ['test.role']);
    assert.strictEqual(await uw.acl.isAllowed(user, 'test.role'), true);

    await uw.acl.disallow(user, ['test.role']);
    assert.strictEqual(await uw.acl.isAllowed(user, 'test.role'), false);
  });

  it('can delete roles', async () => {
    await uw.acl.createRole('test.role', []);
    assert(Object.keys(await uw.acl.getAllRoles()).includes('test.role'));
    await uw.acl.deleteRole('test.role');
    assert(!Object.keys(await uw.acl.getAllRoles()).includes('test.role'));
  });

  describe('GET /roles', () => {
    it('lists available roles', async () => {
      await uw.acl.createRole('test.role', ['test.permission', 'test.permission2']);

      const res = await supertest(uw.server)
        .get('/api/roles')
        .expect(200);

      sinon.assert.match(res.body.data, {
        'test.role': ['test.permission', 'test.permission2'],
      });
    });
  });

  describe('PUT /roles/:name', () => {
    it('requires authentication', async () => {
      await supertest(uw.server)
        .put('/api/roles/test.role')
        .send({
          permissions: ['test.permission', 'test.permission2'],
        })
        .expect(401);
    });

    it('requires the acl.create role', async () => {
      const token = await uw.test.createTestSessionToken(user);

      await supertest(uw.server)
        .put('/api/roles/test.role')
        .set('Cookie', `uwsession=${token}`)
        .send({
          permissions: ['test.permission', 'test.permission2'],
        })
        .expect(403);

      await uw.acl.allow(user, ['acl.create']);

      await supertest(uw.server)
        .put('/api/roles/test.role')
        .set('Cookie', `uwsession=${token}`)
        .send({
          permissions: ['test.permission', 'test.permission2'],
        })
        .expect(201);
    });

    it('validates input', async () => {
      const token = await uw.test.createTestSessionToken(user);
      await uw.acl.allow(user, ['acl.create']);

      let res = await supertest(uw.server)
        .put('/api/roles/test.role')
        .set('Cookie', `uwsession=${token}`)
        .send({})
        .expect(400);
      sinon.assert.match(res.body.errors[0], {
        status: 400,
        code: 'validation-error',
      });

      res = await supertest(uw.server)
        .put('/api/roles/test.role')
        .set('Cookie', `uwsession=${token}`)
        .send({ permissions: 'not an array' })
        .expect(400);
      sinon.assert.match(res.body.errors[0], {
        status: 400,
        code: 'validation-error',
      });

      res = await supertest(uw.server)
        .put('/api/roles/test.role')
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
      await uw.acl.allow(user, ['acl.create']);

      const res = await supertest(uw.server)
        .put('/api/roles/test.role')
        .set('Cookie', `uwsession=${token}`)
        .send({
          permissions: ['test.permission', 'test.permission2'],
        })
        .expect(201);

      sinon.assert.match(res.body.data, {
        name: 'test.role',
        permissions: ['test.permission', 'test.permission2'],
      });
    });
  });

  describe('DELETE /roles/:name', () => {
    it('requires authentication', async () => {
      await uw.acl.createRole('test.role', []);

      await supertest(uw.server)
        .delete('/api/roles/test.role')
        .expect(401);
    });

    it('requires the acl.delete role', async () => {
      const token = await uw.test.createTestSessionToken(user);

      await uw.acl.createRole('test.role', ['test.permission', 'test.permission2']);

      await supertest(uw.server)
        .delete('/api/roles/test.role')
        .set('Cookie', `uwsession=${token}`)
        .expect(403);

      await uw.acl.allow(user, ['acl.delete']);

      await supertest(uw.server)
        .delete('/api/roles/test.role')
        .set('Cookie', `uwsession=${token}`)
        .expect(200);
    });

    it('deletes the role', async () => {
      const moderator = await uw.test.createUser();
      const token = await uw.test.createTestSessionToken(moderator);

      await uw.acl.createRole('test.role', ['test.permission', 'test.permission2']);
      await uw.acl.allow(user, ['test.role']);
      await uw.acl.allow(moderator, ['acl.delete']);

      assert(await uw.acl.isAllowed(user, 'test.role'));

      await supertest(uw.server)
        .delete('/api/roles/test.role')
        .set('Cookie', `uwsession=${token}`)
        .expect(200);

      const res = await supertest(uw.server)
        .get('/api/roles')
        .expect(200);
      assert(!Object.keys(res.body.data).includes('test.role'));

      assert(!await uw.acl.isAllowed(user, 'test.role'));
    });
  });
});
