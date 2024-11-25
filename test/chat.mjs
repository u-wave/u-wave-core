import { randomUUID } from 'crypto';
import assert from 'assert';
import * as sinon from 'sinon';
import supertest from 'supertest';
import delay from 'delay';
import createUwave from './utils/createUwave.mjs';

const sandbox = sinon.createSandbox();

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

describe('Chat', () => {
  let uw;

  beforeEach(async () => {
    uw = await createUwave('chat');
  });
  afterEach(async () => {
    sandbox.restore();
    await uw.destroy();
  });

  it('can broadcast chat messages', async () => {
    const user = await uw.test.createUser();

    const ws = await uw.test.connectToWebSocketAs(user);

    const receivedMessages = [];
    ws.on('message', (data) => {
      receivedMessages.push(JSON.parse(data));
    });

    ws.send(JSON.stringify({ command: 'sendChat', data: 'Message text' }));

    await retryFor(1500, () => {
      assert(receivedMessages.some((message) => message.command === 'chatMessage' && message.data.userID === user.id && message.data.message === 'Message text'));
    });
  });

  it('does not broadcast chat messages from muted users', async () => {
    const user = await uw.test.createUser();
    const token = await uw.test.createTestSessionToken(user);
    await uw.acl.allow(user, ['admin']);
    const mutedUser = await uw.test.createUser();

    await supertest(uw.server)
      .post(`/api/users/${mutedUser.id}/mute`)
      .set('Cookie', `uwsession=${token}`)
      .send({ time: 60 /* seconds */ })
      .expect(200);

    const ws = await uw.test.connectToWebSocketAs(user);
    const mutedWs = await uw.test.connectToWebSocketAs(mutedUser);

    const receivedMessages = [];
    ws.on('message', (data) => {
      receivedMessages.push(JSON.parse(data));
    });

    ws.send(JSON.stringify({ command: 'sendChat', data: 'unmuted' }));
    mutedWs.send(JSON.stringify({ command: 'sendChat', data: 'muted' }));

    await retryFor(1500, () => {
      assert(receivedMessages.some((message) => message.command === 'chatMessage' && message.data.userID === user.id));
      assert(!receivedMessages.some((message) => message.command === 'chatMessage' && message.data.userID === mutedUser.id));
    });
  });

  describe('DELETE /chat/', () => {
    it('requires authentication', async () => {
      await supertest(uw.server)
        .delete('/api/chat')
        .expect(401);
    });

    it('requires the chat.delete permission', async () => {
      const user = await uw.test.createUser();
      const token = await uw.test.createTestSessionToken(user);

      await supertest(uw.server)
        .delete('/api/chat')
        .set('Cookie', `uwsession=${token}`)
        .expect(403);

      await uw.acl.createRole('chatDeleter', ['chat.delete']);
      await uw.acl.allow(user, ['chatDeleter']);

      await supertest(uw.server)
        .delete('/api/chat')
        .set('Cookie', `uwsession=${token}`)
        .expect(200);
    });

    it('broadcasts delete messages', async () => {
      const user = await uw.test.createUser();
      const token = await uw.test.createTestSessionToken(user);
      await uw.acl.createRole('chatDeleter', ['chat.delete']);
      await uw.acl.allow(user, ['chatDeleter']);

      const otherUser = await uw.test.createUser();
      const ws = await uw.test.connectToWebSocketAs(otherUser);

      const receivedMessages = [];
      ws.on('message', (data) => {
        receivedMessages.push(JSON.parse(data));
      });

      await supertest(uw.server)
        .delete('/api/chat')
        .set('Cookie', `uwsession=${token}`)
        .expect(200);

      await retryFor(1500, () => {
        sinon.assert.match(receivedMessages, sinon.match.some(sinon.match.has('command', 'chatDelete')));
      });
    });
  });

  describe('DELETE /chat/user/:id', () => {
    it('requires authentication', async () => {
      const user = await uw.test.createUser();

      await supertest(uw.server)
        .delete(`/api/chat/user/${user.id}`)
        .expect(401);
    });

    it('requires the chat.delete permission', async () => {
      const user = await uw.test.createUser();
      const token = await uw.test.createTestSessionToken(user);

      await supertest(uw.server)
        .delete(`/api/chat/user/${user.id}`)
        .set('Cookie', `uwsession=${token}`)
        .expect(403);

      await uw.acl.createRole('chatDeleter', ['chat.delete']);
      await uw.acl.allow(user, ['chatDeleter']);

      await supertest(uw.server)
        .delete(`/api/chat/user/${user.id}`)
        .set('Cookie', `uwsession=${token}`)
        .expect(200);
    });

    it('broadcasts delete messages', async () => {
      const user = await uw.test.createUser();
      const token = await uw.test.createTestSessionToken(user);
      await uw.acl.createRole('chatDeleter', ['chat.delete']);
      await uw.acl.allow(user, ['chatDeleter']);

      const otherUser = await uw.test.createUser();
      const ws = await uw.test.connectToWebSocketAs(otherUser);

      const receivedMessages = [];
      ws.on('message', (data) => {
        receivedMessages.push(JSON.parse(data));
      });

      await supertest(uw.server)
        .delete(`/api/chat/user/${otherUser.id}`)
        .set('Cookie', `uwsession=${token}`)
        .expect(200);

      await retryFor(1500, () => {
        sinon.assert.match(receivedMessages, sinon.match.some(sinon.match({
          command: 'chatDeleteByUser',
          data: sinon.match({
            userID: otherUser.id,
          }),
        })));
      });
    });
  });

  describe('DELETE /chat/:id', () => {
    const messageID = randomUUID();

    it('requires authentication', async () => {
      await supertest(uw.server)
        .delete(`/api/chat/${messageID}`)
        .expect(401);
    });

    it('requires the chat.delete permission', async () => {
      const user = await uw.test.createUser();
      const token = await uw.test.createTestSessionToken(user);

      await supertest(uw.server)
        .delete(`/api/chat/${messageID}`)
        .set('Cookie', `uwsession=${token}`)
        .expect(403);

      await uw.acl.createRole('chatDeleter', ['chat.delete']);
      await uw.acl.allow(user, ['chatDeleter']);

      await supertest(uw.server)
        .delete(`/api/chat/${messageID}`)
        .set('Cookie', `uwsession=${token}`)
        .expect(200);
    });

    it('broadcasts delete messages', async () => {
      const user = await uw.test.createUser();
      const token = await uw.test.createTestSessionToken(user);
      await uw.acl.createRole('chatDeleter', ['chat.delete']);
      await uw.acl.allow(user, ['chatDeleter']);

      const otherUser = await uw.test.createUser();
      const ws = await uw.test.connectToWebSocketAs(otherUser);

      const receivedMessages = [];
      ws.on('message', (data) => {
        receivedMessages.push(JSON.parse(data));
      });

      await supertest(uw.server)
        .delete(`/api/chat/${messageID}`)
        .set('Cookie', `uwsession=${token}`)
        .expect(200);

      await retryFor(1500, () => {
        sinon.assert.match(receivedMessages, sinon.match.some(sinon.match({
          command: 'chatDeleteByID',
          data: sinon.match({
            _id: messageID,
          }),
        })));
      });
    });
  });
});
