import assert from 'assert';
import * as sinon from 'sinon';
import delay from 'delay';
import supertest from 'supertest';
import createUwave from './utils/createUwave.mjs';
import testSource from './utils/testSource.mjs';

/** Retry the `fn` until it doesn't throw, or until the duration in milliseconds has elapsed. */
async function retryFor(duration, fn) {
  const end = Date.now() + duration;
  let caughtError;
  while (Date.now() < end) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      caughtError = err;
    }
    await delay(10);
  }

  if (caughtError != null) {
    throw new Error(`Failed after ${duration}ms`, { cause: caughtError });
  }
}

describe('Booth', () => {
  describe('GET /booth', () => {
    let uw;
    beforeEach(async () => {
      uw = await createUwave('booth');
    });
    afterEach(async () => {
      await uw.destroy();
    });

    it('is null when nobody is playing', async () => {
      const res = await supertest(uw.server)
        .get('/api/booth')
        .expect(200);
      assert.strictEqual(res.body.data, null);
    });

    it('returns current booth', async () => {
      uw.source(testSource);

      const user = await uw.test.createUser();
      await uw.acl.allow(user, ['user']);

      const token = await uw.test.createTestSessionToken(user);

      // Prep the account to be able to join the waitlist
      const { playlist } = await uw.playlists.createPlaylist(user, { name: 'booth' });
      {
        const item = await uw.source('test-source').getOne(user, 'HISTORY');
        await uw.playlists.addPlaylistItems(playlist, [item]);
      }
      const ws = await uw.test.connectToWebSocketAs(user);

      await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${token}`)
        .send({ userID: user.id })
        .expect(200);

      const res = await supertest(uw.server)
        .get('/api/booth')
        .expect(200);
      sinon.assert.match(res.body.data, {
        userID: user.id,
        historyID: sinon.match.string,
        playedAt: sinon.match.number,
        media: sinon.match.hasNested('media.sourceID', 'HISTORY'),
      });

      ws.close();
    });
  });

  describe('PUT /booth/:historyID/vote', () => {
    let uw;
    beforeEach(async () => {
      uw = await createUwave('votes');
    });
    afterEach(async () => {
      await uw.destroy();
    });

    const unknownHistoryID = '7e8c3ef1-6670-4b52-b334-0c93df924507';

    it('requires authentication', async () => {
      await supertest(uw.server)
        .put(`/api/booth/${unknownHistoryID}/vote`)
        .send({ direction: 1 })
        .expect(401);
    });

    it('validates input', async () => {
      const user = await uw.test.createUser();
      const token = await uw.test.createTestSessionToken(user);

      await supertest(uw.server)
        .put(`/api/booth/${unknownHistoryID}/vote`)
        .set('Cookie', `uwsession=${token}`)
        .send({ direction: 'not a number' })
        .expect(400);

      await supertest(uw.server)
        .put(`/api/booth/${unknownHistoryID}/vote`)
        .set('Cookie', `uwsession=${token}`)
        .send({ direction: 0 })
        .expect(400);

      // These inputs are formatted correctly, but we still expect a 412 because
      // the history ID does not exist.
      await supertest(uw.server)
        .put(`/api/booth/${unknownHistoryID}/vote`)
        .set('Cookie', `uwsession=${token}`)
        .send({ direction: 1 })
        .expect(412);

      await supertest(uw.server)
        .put(`/api/booth/${unknownHistoryID}/vote`)
        .set('Cookie', `uwsession=${token}`)
        .send({ direction: -1 })
        .expect(412);
    });

    it('broadcasts votes', async () => {
      uw.source(testSource);

      const dj = await uw.test.createUser();
      const user = await uw.test.createUser();

      await uw.acl.allow(dj, ['user']);

      const token = await uw.test.createTestSessionToken(user);
      const ws = await uw.test.connectToWebSocketAs(user);
      const receivedMessages = [];
      ws.on('message', (data, isBinary) => {
        receivedMessages.push(JSON.parse(isBinary ? data.toString() : data));
      });

      // Prep the DJ account to be able to join the waitlist
      const { playlist } = await uw.playlists.createPlaylist(dj, { name: 'vote' });
      {
        const item = await uw.source('test-source').getOne(dj, 'FOR_VOTE');
        await uw.playlists.addPlaylistItems(playlist, [item]);
      }

      const djWs = await uw.test.connectToWebSocketAs(dj);
      {
        const djToken = await uw.test.createTestSessionToken(dj);
        await supertest(uw.server)
          .post('/api/waitlist')
          .set('Cookie', `uwsession=${djToken}`)
          .send({ userID: dj.id })
          .expect(200);
      }

      const { body } = await supertest(uw.server)
        .get('/api/now')
        .expect(200);
      const { historyID } = body.booth;

      await supertest(uw.server)
        .put(`/api/booth/${historyID}/vote`)
        .set('Cookie', `uwsession=${token}`)
        .send({ direction: -1 })
        .expect(200);

      await retryFor(500, () => {
        assert(receivedMessages.some((message) => message.command === 'vote' && message.data.value === -1));
      });

      // Resubmit vote without changing
      receivedMessages.length = 0;
      await supertest(uw.server)
        .put(`/api/booth/${historyID}/vote`)
        .set('Cookie', `uwsession=${token}`)
        .send({ direction: -1 })
        .expect(200);

      // Need to just wait, as we can't assert for the absence of something happening
      // without waiting the whole time limit
      await delay(200);
      assert(
        !receivedMessages.some((message) => message.command === 'vote' && message.data.value === -1),
        'should not have re-emitted the vote',
      );

      await supertest(uw.server)
        .put(`/api/booth/${historyID}/vote`)
        .set('Cookie', `uwsession=${token}`)
        .send({ direction: 1 })
        .expect(200);

      await retryFor(500, () => {
        assert(receivedMessages.some((message) => message.command === 'vote' && message.data.value === 1));
      });

      djWs.close();
    });
  });

  describe('GET /booth/history', () => {
    let uw;
    beforeEach(async () => {
      uw = await createUwave('booth');
    });
    afterEach(async () => {
      await uw.destroy();
    });

    it('is empty', async () => {
      const res = await supertest(uw.server)
        .get('/api/booth/history')
        .expect(200);
      assert.strictEqual(res.body.meta.total, 0);
      assert.deepStrictEqual(res.body.data, []);
    });

    it('returns current play', async () => {
      uw.source(testSource);

      const user = await uw.test.createUser();
      await uw.acl.allow(user, ['user']);

      const token = await uw.test.createTestSessionToken(user);

      // Prep the account to be able to join the waitlist
      const { playlist } = await uw.playlists.createPlaylist(user, { name: 'booth' });
      {
        const item = await uw.source('test-source').getOne(user, 'HISTORY');
        await uw.playlists.addPlaylistItems(playlist, [item]);
      }
      const ws = await uw.test.connectToWebSocketAs(user);

      await supertest(uw.server)
        .post('/api/waitlist')
        .set('Cookie', `uwsession=${token}`)
        .send({ userID: user.id })
        .expect(200);

      const res = await supertest(uw.server)
        .get('/api/booth/history')
        .expect(200);
      sinon.assert.match(res.body.data[0], {
        user: user.id,
        _id: sinon.match.string,
        playedAt: sinon.match.string,
      });
      sinon.assert.match(res.body.included, {
        media: sinon.match.some(sinon.match.has('sourceID', 'HISTORY')),
        user: sinon.match.some(sinon.match.has('_id', user.id)),
      });

      ws.close();
    });
  });
});
