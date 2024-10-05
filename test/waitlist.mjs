import assert from 'assert';
import supertest from 'supertest';
import * as sinon from 'sinon';
import randomString from 'random-string';
import createUwave from './utils/createUwave.mjs';

describe('Waitlist', () => {
  let user;
  let uw;

  beforeEach(async () => {
    uw = await createUwave('waitlist');
    user = await uw.test.createUser();

    uw.source({
      name: 'test-source',
      api: 2,
      async get(_context, ids) {
        return ids.map((id) => ({
          sourceID: id,
          artist: `artist ${id}`,
          title: `title ${id}`,
          duration: 60,
          thumbnail: 'https://placedog.net/280',
        }));
      },
      async search() {
        throw new Error('unimplemented');
      },
    });
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
  });
});
