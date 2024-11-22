import assert from 'assert';
import delay from 'delay';
import supertest from 'supertest';
import createUwave from './utils/createUwave.mjs';
import testSource from './utils/testSource.mjs';

describe('Booth', () => {
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
      await delay(200);

      assert(receivedMessages.some((message) => message.command === 'vote' && message.data.value === -1));

      // Resubmit vote without changing
      receivedMessages.length = 0;
      await supertest(uw.server)
        .put(`/api/booth/${historyID}/vote`)
        .set('Cookie', `uwsession=${token}`)
        .send({ direction: -1 })
        .expect(200);
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
      await delay(200);

      assert(receivedMessages.some((message) => message.command === 'vote' && message.data.value === 1));

      djWs.close();
    });
  });
});
