import assert from 'assert';
import supertest from 'supertest';
import createUwave from './utils/createUwave.mjs';

describe('Now', () => {
  let uw;
  beforeEach(async () => {
    uw = await createUwave('acl');
  });
  afterEach(async () => {
    await uw.destroy();
  });

  describe('GET /now', () => {
    it('allows unauthenticated access', async () => {
      await supertest(uw.server)
        .get('/api/now')
        .expect(200);
    });

    it('returns current user object in authenticated access', async () => {
      const user = await uw.test.createUser();
      const token = await uw.test.createTestSessionToken(user);

      const res = await supertest(uw.server)
        .get('/api/now')
        .set('Cookie', `uwsession=${token}`)
        .expect(200);

      assert.strictEqual(res.body.user._id, user.id);
      assert.strictEqual(res.body.activePlaylist, null);
    });

    it('returns active playlist for authenticated users', async () => {
      const user = await uw.test.createUser();
      const token = await uw.test.createTestSessionToken(user);

      const playlistRes = await supertest(uw.server)
        .post('/api/playlists')
        .set('Cookie', `uwsession=${token}`)
        .send({ name: 'test playlist please ignore' })
        .expect(200);

      const nowRes = await supertest(uw.server)
        .get('/api/now')
        .set('Cookie', `uwsession=${token}`)
        .expect(200);

      assert.strictEqual(nowRes.body.activePlaylist, playlistRes.body.data._id);
    });
  });
});
