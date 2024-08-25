import { randomUUID } from 'crypto';
import events from 'events';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';

async function testPlugin(uw) {
  let i = Date.now();
  function createUser() {
    const props = {
      id: randomUUID(),
      username: `test_user_${i.toString(36)}`,
      slug: i.toString(36),
      email: `test${i.toString(36)}@example.com`,
      password: 'passwordhash',
    };
    i += 1;
    return uw.db.insertInto('users')
      .values(props)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async function connectToWebSocketAs(user) {
    const { port } = uw.server.address();
    const token = await uw.socketServer.authRegistry.createAuthToken(user);

    const ws = new WebSocket(`ws://localhost:${port}`);
    await events.once(ws, 'open');

    ws.send(token);

    const [buffer, isBinary] = await events.once(ws, 'message');
    const data = JSON.parse(isBinary ? buffer.toString() : buffer);

    if (data.command === 'error') {
      throw new Error(data.data);
    } else if (data.command !== 'authenticated') {
      throw new Error(`unexpected socket message ${buffer}`);
    }

    return ws;
  }

  async function createTestSessionToken(user) {
    const token = jwt.sign(
      { id: user.id },
      uw.options.secret,
      { expiresIn: '1d' },
    );
    return token;
  }

  uw.test = {
    createUser,
    createTestSessionToken,
    connectToWebSocketAs,
  };
}

export default testPlugin;
