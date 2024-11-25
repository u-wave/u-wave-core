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

    await retryFor(1500, async () => {
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

    await retryFor(1500, async () => {
      assert(receivedMessages.some((message) => message.command === 'chatMessage' && message.data.userID === user.id));
      assert(!receivedMessages.some((message) => message.command === 'chatMessage' && message.data.userID === mutedUser.id));
    });
  });
});
