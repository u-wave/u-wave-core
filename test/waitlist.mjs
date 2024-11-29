import assert from 'assert';
import supertest from 'supertest';
import * as sinon from 'sinon';
import randomString from 'random-string';
import createUwave from './utils/createUwave.mjs';
import testSource from './utils/testSource.mjs';

describe('Waitlist', () => {
  let user;
  let uw;

  beforeEach(async () => {
    uw = await createUwave('waitlist');
    user = await uw.test.createUser();

    uw.source(testSource);
  });
  afterEach(async () => {
    await uw.destroy();
  });

  function createUsers(count) {
    return Promise.all(Array(count).fill(null).map(uw.test.createUser));
  }

  async function createTestPlaylistItem(testUser) {
    const { playlist } = await uw.playlists.createPlaylist(testUser, { name: 'Test Playlist' });
    await uw.playlists.addPlaylistItems(playlist, [{
      sourceType: 'test-source',
      sourceID: randomString({ length: 10 }),
    }]);
  }

  describe('GET /waitlist', () => {
    it('responds with current waiting userIDs', async () => {
      const token = await uw.test.createTestSessionToken(user);

      const emptyRes = await supertest(uw.server)
        .get('/api/waitlist')
        .set('Cookie', `uwsession=${token}`)
        .expect(200);
      assert.deepStrictEqual(emptyRes.body.data, []);

      const users = await createUsers(4);

      await Promise.all(users.map(createTestPlaylistItem));
      for (const u of users) {
        await uw.waitlist.addUser(u.id);
      }

      const fullRes = await supertest(uw.server)
        .get('/api/waitlist')
        .set('Cookie', `uwsession=${token}`)
        .expect(200);
      // users[0] is in the booth
      assert.deepStrictEqual(fullRes.body.data, [
        users[1].id,
        users[2].id,
        users[3].id,
      ]);
    });
  });

  describe('POST /waitlist', () => {
    it('requires authentication', async () => {
      await supertest(uw.server)
        .post('/api/waitlist')
        .expect(401);
    });

    // https://github.com/u-wave/http-api/pull/110
    it('requires an active socket connection to join', async () => {
      const token = await uw.test.createTestSessionToken(user);
      await uw.acl.allow(user, ['user']);
      await createTestPlaylistItem(user);

      await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${token}`)
        .send({ userID: user.id })
        .expect(400);

      await uw.test.connectToWebSocketAs(user);

      await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${token}`)
        .send({ userID: user.id })
        .expect(200);
    });

    it('requires an active non-empty playlist to join', async () => {
      const token = await uw.test.createTestSessionToken(user);
      await uw.acl.allow(user, ['user']);
      await uw.test.connectToWebSocketAs(user);

      const noPlaylistRes = await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${token}`)
        .send({ userID: user.id })
        .expect(403);
      sinon.assert.match(noPlaylistRes.body.errors[0], { code: 'empty-playlist' });

      const { playlist } = await uw.playlists.createPlaylist(user, { name: 'Test Playlist' });

      const emptyPlaylistRes = await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${token}`)
        .send({ userID: user.id })
        .expect(403);
      sinon.assert.match(emptyPlaylistRes.body.errors[0], { code: 'empty-playlist' });

      await uw.playlists.addPlaylistItems(playlist, [{
        sourceType: 'test-source',
        sourceID: randomString({ length: 10 }),
      }]);

      await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${token}`)
        .send({ userID: user.id })
        .expect(200);

      const res = await supertest(uw.server)
        .get('/api/booth')
        .set('Cookie', `uwsession=${token}`)
        .expect(200);
      sinon.assert.match(res.body.data, { userID: user.id });
    });

    it('prevents double-joining', async () => {
      await uw.acl.allow(user, ['user']);
      await createTestPlaylistItem(user);

      const token = await uw.test.createTestSessionToken(user);
      await uw.test.connectToWebSocketAs(user);

      await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${token}`)
        .send({ userID: user.id })
        .expect(200);

      const res = await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${token}`)
        .send({ userID: user.id })
        .expect(400);

      sinon.assert.match(res.body.errors[0], { code: 'already-in-waitlist' });
    });

    it('requires waitlist.join permission to join', async () => {
      const token = await uw.test.createTestSessionToken(user);
      await createTestPlaylistItem(user);

      const ws = await uw.test.connectToWebSocketAs(user);

      await uw.acl.createRole('waitlistJoiner', ['waitlist.join']);

      const notAllowedRes = await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${token}`)
        .send({ userID: user.id })
        .expect(403);
      sinon.assert.match(notAllowedRes.body, {
        errors: sinon.match.some(sinon.match.has('code', 'forbidden')),
      });

      await uw.acl.allow(user, ['waitlistJoiner']);

      await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${token}`)
        .send({ userID: user.id })
        .expect(200);

      ws.close();
    });

    it('requires the waitlist.add role to add other users', async () => {
      const token = await uw.test.createTestSessionToken(user);
      await uw.acl.allow(user, ['user']);

      const testSubject = await uw.test.createUser();
      await createTestPlaylistItem(testSubject);

      // TODO It should check if the user to be added has
      // an active connection, not the moderator…
      await uw.test.connectToWebSocketAs(user);

      await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${token}`)
        .send({ userID: testSubject.id })
        .expect(403);

      await uw.acl.createRole('adder', ['waitlist.add']);
      await uw.acl.allow(user, ['adder']);

      await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${token}`)
        .send({ userID: testSubject.id })
        .expect(200);
    });

    it('prevents joining when waitlist is locked', async () => {
      const token = await uw.test.createTestSessionToken(user);
      const joiner = await uw.test.createUser();
      const joinerToken = await uw.test.createTestSessionToken(joiner);

      await uw.acl.createRole('waitlistJoiner', ['waitlist.join']);
      await uw.acl.createRole('waitlistLocker', ['waitlist.lock']);

      await uw.acl.allow(joiner, ['waitlistJoiner']);
      await uw.acl.allow(user, ['waitlistLocker']);

      const ws = await uw.test.connectToWebSocketAs(joiner);
      await createTestPlaylistItem(joiner);

      await supertest(uw.server)
        .put('/api/waitlist/lock')
        .set('Cookie', `uwsession=${token}`)
        .send({ lock: true })
        .expect(200);

      const lockedRes = await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${joinerToken}`)
        .send({ userID: joiner.id })
        .expect(403);
      sinon.assert.match(lockedRes.body, {
        errors: sinon.match.some(sinon.match.has('code', 'waitlist-locked')),
      });

      // Unlock & try again
      await supertest(uw.server)
        .put('/api/waitlist/lock')
        .set('Cookie', `uwsession=${token}`)
        .send({ lock: false })
        .expect(200);

      await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${joinerToken}`)
        .send({ userID: joiner.id })
        .expect(200);

      ws.close();
    });

    it('requires waitlist.join.locked permission to join if locked', async () => {
      const token = await uw.test.createTestSessionToken(user);
      const joiner = await uw.test.createUser();
      const joinerToken = await uw.test.createTestSessionToken(joiner);

      await uw.acl.createRole('waitlistJoiner', ['waitlist.join']);
      await uw.acl.createRole('waitlistSuperJoiner', ['waitlist.join.locked']);
      await uw.acl.createRole('waitlistLocker', ['waitlist.lock']);

      await uw.acl.allow(joiner, ['waitlistJoiner']);
      await uw.acl.allow(user, ['waitlistLocker']);

      const ws = await uw.test.connectToWebSocketAs(joiner);
      await createTestPlaylistItem(joiner);

      await supertest(uw.server)
        .put('/api/waitlist/lock')
        .set('Cookie', `uwsession=${token}`)
        .send({ lock: true })
        .expect(200);

      const lockedRes = await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${joinerToken}`)
        .send({ userID: joiner.id })
        .expect(403);
      sinon.assert.match(lockedRes.body, {
        errors: sinon.match.some(sinon.match.has('code', 'waitlist-locked')),
      });

      await uw.acl.allow(joiner, ['waitlistSuperJoiner']);

      await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${joinerToken}`)
        .send({ userID: joiner.id })
        .expect(200);

      ws.close();
    });
  });

  describe('PUT /waitlist/lock', () => {
    it('requires authentication', async () => {
      await supertest(uw.server)
        .put('/api/waitlist/lock')
        .expect(401);
    });

    it('requires the waitlist.lock role', async () => {
      const token = await uw.test.createTestSessionToken(user);
      await uw.acl.createRole('waitlistLocker', ['waitlist.lock']);

      await supertest(uw.server)
        .put('/api/waitlist/lock')
        .set('Cookie', `uwsession=${token}`)
        .send({ lock: true })
        .expect(403);

      await uw.acl.allow(user, ['waitlistLocker']);

      await supertest(uw.server)
        .put('/api/waitlist/lock')
        .set('Cookie', `uwsession=${token}`)
        .send({ lock: true })
        .expect(200);
    });

    it('validates input', async () => {
      const token = await uw.test.createTestSessionToken(user);
      await uw.acl.createRole('waitlistLocker', ['waitlist.lock']);
      await uw.acl.allow(user, ['waitlistLocker']);

      await supertest(uw.server)
        .put('/api/waitlist/lock')
        .set('Cookie', `uwsession=${token}`)
        .send({ lock: 'not a boolean' })
        .expect(400);

      await supertest(uw.server)
        .put('/api/waitlist/lock')
        .set('Cookie', `uwsession=${token}`)
        .expect(400);

      await supertest(uw.server)
        .put('/api/waitlist/lock')
        .set('Cookie', `uwsession=${token}`)
        .send({ no: 'lock property' })
        .expect(400);

      await supertest(uw.server)
        .put('/api/waitlist/lock')
        .set('Cookie', `uwsession=${token}`)
        .send({ lock: false })
        .expect(200);

      await supertest(uw.server)
        .put('/api/waitlist/lock')
        .set('Cookie', `uwsession=${token}`)
        .send({ lock: true })
        .expect(200);
    });
  });

  describe('DELETE /waitlist/:id', () => {
    it('requires authentication', async () => {
      await supertest(uw.server)
        .delete(`/api/waitlist/${user.id}`)
        .expect(401);
    });

    it('returns a useful error when user is not in waitlist', async () => {
      const token = await uw.test.createTestSessionToken(user);
      await uw.acl.allow(user, ['user']);

      const res = await supertest(uw.server)
        .delete(`/api/waitlist/${user.id}`)
        .set('Cookie', `uwsession=${token}`)
        .expect(404);
      sinon.assert.match(res.body, {
        errors: sinon.match.some(sinon.match.has('code', 'not-in-waitlist')),
      });
    });

    it('can remove self', async () => {
      // This is a bit janky, but we need a user to take up the DJ spot,
      // so the user we remove is still in the waitlist.
      const dj = await uw.test.createUser();
      await uw.test.connectToWebSocketAs(user);
      await uw.test.connectToWebSocketAs(dj);

      await uw.acl.allow(dj, ['user']);
      await uw.acl.allow(user, ['user']);

      await createTestPlaylistItem(dj);
      await createTestPlaylistItem(user);

      await uw.waitlist.addUser(dj.id);
      await uw.waitlist.addUser(user.id);

      const prevWaitlist = await supertest(uw.server)
        .get('/api/waitlist')
        .expect(200);
      sinon.assert.match(prevWaitlist.body.data, [user.id]);

      const token = await uw.test.createTestSessionToken(user);

      await supertest(uw.server)
        .delete(`/api/waitlist/${user.id}`)
        .set('Cookie', `uwsession=${token}`)
        .expect(200);

      const nextWaitlist = await supertest(uw.server)
        .get('/api/waitlist')
        .expect(200);
      sinon.assert.match(nextWaitlist.body.data, []);
    });
  });
});
