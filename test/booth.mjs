import assert from 'assert';
import delay from 'delay';
import supertest from 'supertest';
import createUwave from './utils/createUwave.mjs';

describe('Booth', () => {
  describe('PUT /booth/:historyID/vote', () => {
    let uw;
    beforeEach(async () => {
      uw = await createUwave('votes');
    });
    afterEach(async () => {
      await uw.destroy();
    });

    const historyID = '7e8c3ef1-6670-4b52-b334-0c93df924507';

    it('requires authentication', async () => {
      await supertest(uw.server)
        .put(`/api/booth/${historyID}/vote`)
        .send({ direction: 1 })
        .expect(401);
    });

    it('validates input', async () => {
      const user = await uw.test.createUser();
      const token = await uw.test.createTestSessionToken(user);

      await supertest(uw.server)
        .put(`/api/booth/${historyID}/vote`)
        .set('Cookie', `uwsession=${token}`)
        .send({ direction: 'not a number' })
        .expect(400);

      await supertest(uw.server)
        .put(`/api/booth/${historyID}/vote`)
        .set('Cookie', `uwsession=${token}`)
        .send({ direction: 0 })
        .expect(400);

      // These inputs are formatted correctly, but we still expect a 412 because
      // the history ID does not exist.
      await supertest(uw.server)
        .put(`/api/booth/${historyID}/vote`)
        .set('Cookie', `uwsession=${token}`)
        .send({ direction: 1 })
        .expect(412);

      await supertest(uw.server)
        .put(`/api/booth/${historyID}/vote`)
        .set('Cookie', `uwsession=${token}`)
        .send({ direction: -1 })
        .expect(412);
    });

    it('broadcasts votes', async () => {
      const dj = await uw.test.createUser();
      const user = await uw.test.createUser();
      const token = await uw.test.createTestSessionToken(user);
      const ws = await uw.test.connectToWebSocketAs(user);
      const receivedMessages = [];
      ws.on('message', (data, isBinary) => {
        receivedMessages.push(JSON.parse(isBinary ? data.toString() : data));
      });

      // Pretend that a DJ exists
      await uw.redis.set('booth:currentDJ', dj.id);
      await uw.redis.set('booth:historyID', historyID);

      await supertest(uw.server)
        .put(`/api/booth/${historyID}/vote`)
        .set('Cookie', `uwsession=${token}`)
        .send({ direction: -1 })
        .expect(200);
      await delay(200);

      assert(receivedMessages.some((message) => message.command === 'vote' && message.data.value === -1));

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
    });
  });
});
