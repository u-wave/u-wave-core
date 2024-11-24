import assert from 'assert';
import supertest from 'supertest';
import createUwave from './utils/createUwave.mjs';

describe('MOTD', () => {
  let uw;
  beforeEach(async () => {
    uw = await createUwave('motd');
  });
  afterEach(async () => {
    await uw.destroy();
  });

  describe('GET /motd', () => {
    it('allows unauthenticated access', async () => {
      await supertest(uw.server)
        .get('/api/motd')
        .expect(200);
    });
  });

  describe('PUT /motd', () => {
    it('requires motd.set permission to update', async () => {
      const user = await uw.test.createUser();
      const token = await uw.test.createTestSessionToken(user);

      // Not authenticated
      await supertest(uw.server)
        .put('/api/motd')
        .send({ motd: 'test message of the day' })
        .expect(401);

      // Authenticated but not authorized
      await supertest(uw.server)
        .put('/api/motd')
        .set('Cookie', `uwsession=${token}`)
        .send({ motd: 'test message of the day' })
        .expect(403);
    });

    it('validates input', async () => {
      const user = await uw.test.createUser();
      await uw.acl.createRole('setMotd', ['motd.set']);
      await uw.acl.allow(user, ['setMotd']);

      const token = await uw.test.createTestSessionToken(user);

      await supertest(uw.server)
        .put('/api/motd')
        .set('Cookie', `uwsession=${token}`)
        .send({ noMotd: 'a' })
        .expect(400);

      await supertest(uw.server)
        .put('/api/motd')
        .set('Cookie', `uwsession=${token}`)
        .send({ motd: ['not', 'a', 'string'] })
        .expect(400);

      await supertest(uw.server)
        .put('/api/motd')
        .set('Cookie', `uwsession=${token}`)
        .send({ motd: 1 })
        .expect(400);

      await supertest(uw.server)
        .put('/api/motd')
        .set('Cookie', `uwsession=${token}`)
        .send({ motd: 'ok' })
        .expect(200);

      await supertest(uw.server)
        .put('/api/motd')
        .set('Cookie', `uwsession=${token}`)
        .send({ motd: null })
        .expect(200);
    });

    it('updates the message', async () => {
      const user = await uw.test.createUser();
      await uw.acl.createRole('setMotd', ['motd.set']);
      await uw.acl.allow(user, ['setMotd']);

      const token = await uw.test.createTestSessionToken(user);

      const setRes = await supertest(uw.server)
        .put('/api/motd')
        .set('Cookie', `uwsession=${token}`)
        .send({ motd: 'new message of the day' })
        .expect(200);
      assert.deepStrictEqual(setRes.body.data, { motd: 'new message of the day' });

      const getRes = await supertest(uw.server)
        .get('/api/motd')
        .expect(200);
      assert.deepStrictEqual(getRes.body.data, { motd: 'new message of the day' });

      const nowRes = await supertest(uw.server)
        .get('/api/now')
        .expect(200);
      assert.strictEqual(nowRes.body.motd, 'new message of the day');

      const clearRes = await supertest(uw.server)
        .put('/api/motd')
        .set('Cookie', `uwsession=${token}`)
        .send({ motd: null })
        .expect(200);
      assert.deepStrictEqual(clearRes.body.data, { motd: null });

      const clearedRes = await supertest(uw.server)
        .get('/api/motd')
        .expect(200);
      assert.deepStrictEqual(clearedRes.body.data, { motd: null });
    });
  });
});

