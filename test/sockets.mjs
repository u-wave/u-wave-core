import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import * as sinon from 'sinon';
import createUwave from './utils/createUwave.mjs';
import { retryFor } from './utils/retry.mjs';

describe('Sockets', () => {
  let uw;

  beforeEach(async () => {
    uw = await createUwave('sockets');
  });
  afterEach(async () => {
    await uw.destroy();
  });

  it('keeps messages in queue', async () => {
    const user = await uw.test.createUser();
    // TODO: Manually providing session ID here partially defeats the purpose of the test.
    // The websocket connection should instead mimick the "normal" way of connecting,
    // with a server-generated auth token
    const userSession = randomUUID();
    const chatter = await uw.test.createUser();

    const ws = await uw.test.connectToWebSocketAs(user, userSession);
    const wsChatter = await uw.test.connectToWebSocketAs(chatter);

    const receivedMessages = [];
    ws.on('message', (data) => {
      receivedMessages.push(JSON.parse(data));
    });

    wsChatter.send(JSON.stringify({ command: 'sendChat', data: 'a' }));
    wsChatter.send(JSON.stringify({ command: 'sendChat', data: 'b' }));

    await retryFor(1500, () => {
      sinon.assert.match(receivedMessages, sinon.match.some(sinon.match({
        command: 'chatMessage',
        data: { userID: chatter.id, message: 'a' },
      })));
      sinon.assert.match(receivedMessages, sinon.match.some(sinon.match({
        command: 'chatMessage',
        data: { userID: chatter.id, message: 'b' },
      })));
    });

    // Lose the connection
    ws.close();
    await once(ws, 'close');

    wsChatter.send(JSON.stringify({ command: 'sendChat', data: 'c' }));
    wsChatter.send(JSON.stringify({ command: 'sendChat', data: 'd' }));
    wsChatter.close();
    await once(wsChatter, 'close');

    // Reconnect & receive the messages
    const ws2 = await uw.test.connectToWebSocketAs(user, userSession);
    ws2.on('message', (data) => {
      receivedMessages.push(JSON.parse(data));
    });

    await retryFor(1500, () => {
      sinon.assert.match(receivedMessages, sinon.match.some(sinon.match({
        command: 'chatMessage',
        data: { userID: chatter.id, message: 'c' },
      })));
      sinon.assert.match(receivedMessages, sinon.match.some(sinon.match({
        command: 'chatMessage',
        data: { userID: chatter.id, message: 'd' },
      })));
    });

    ws2.close();
  });
});
