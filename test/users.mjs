import supertest from 'supertest';
import * as sinon from 'sinon';
import createUwave from './utils/createUwave.mjs';

describe('Users', () => {
  let user;
  let uw;
  beforeEach(async () => {
    uw = await createUwave('bans');
    user = await uw.test.createUser();
  });
  afterEach(async () => {
    await uw.destroy();
  });

  describe('GET /api/users', () => {
    it('requires authentication', async () => {
      await supertest(uw.server)
        .get('/api/users')
        .expect(401);
    });

    it('requires the users.list role', async () => {
      const token = await uw.test.createTestSessionToken(user);

      await supertest(uw.server)
        .get('/api/users')
        .set('Cookie', `uwsession=${token}`)
        .expect(403);

      await uw.acl.createRole('lister', ['users.list']);
      await uw.acl.allow(user, ['lister']);

      await supertest(uw.server)
        .get('/api/users')
        .set('Cookie', `uwsession=${token}`)
        .expect(200);
    });
  });

  // TODO: this would make more sense as PATCH /api/users/:id...
  describe('PUT /api/users/:id/username', () => {
    it('requires authentication', async () => {
      await supertest(uw.server)
        .put(`/api/users/${user.id}/username`)
        .send({ username: 'notloggedin' })
        .expect(401);
    });

    it('rejects invalid input', async () => {
      const token = await uw.test.createTestSessionToken(user);

      await supertest(uw.server)
        .put(`/api/users/${user.id}/username`)
        .set('Cookie', `uwsession=${token}`)
        .send({ username: 'with spaces' })
        .expect(400);
    });

    it('changes the username', async () => {
      const token = await uw.test.createTestSessionToken(user);

      const res = await supertest(uw.server)
        .put(`/api/users/${user.id}/username`)
        .set('Cookie', `uwsession=${token}`)
        .send({ username: 'new_username' })
        .expect(200);

      sinon.assert.match(res.body.data, {
        username: 'new_username',
        slug: 'new_username',
      });
    });

    it('slugifies the new name well', async () => {
      const token = await uw.test.createTestSessionToken(user);

      const res = await supertest(uw.server)
        .put(`/api/users/${user.id}/username`)
        .set('Cookie', `uwsession=${token}`)
        .send({ username: '테스트네임' })
        .expect(200);

      sinon.assert.match(res.body.data, {
        username: '테스트네임',
        slug: 'teseuteuneim',
      });
    });

    it("can not change someone else's username", async () => {
      const token = await uw.test.createTestSessionToken(user);
      const secondUser = await uw.test.createUser();

      await supertest(uw.server)
        .put(`/api/users/${secondUser.id}/username`)
        .set('Cookie', `uwsession=${token}`)
        .send({ username: 'new_username' })
        .expect(403);
    });

    it('reports conflicts', async () => {
      const token = await uw.test.createTestSessionToken(user);

      const secondUser = await uw.test.createUser();
      const secondToken = await uw.test.createTestSessionToken(secondUser);

      await supertest(uw.server)
        .put(`/api/users/${user.id}/username`)
        .set('Cookie', `uwsession=${token}`)
        .send({ username: 'thisWillConflict' })
        .expect(200);

      const res = await supertest(uw.server)
        .put(`/api/users/${secondUser.id}/username`)
        .set('Cookie', `uwsession=${secondToken}`)
        .send({ username: 'thisWillConflict!' })
        .expect(422);

      sinon.assert.match(res.body.errors[0], {
        code: 'invalid-username',
      });
    });
  });
});
