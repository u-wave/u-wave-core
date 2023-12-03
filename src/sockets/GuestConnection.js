import EventEmitter from 'node:events';
import Ultron from 'ultron';

class GuestConnection extends EventEmitter {
  #logger;

  /**
   * @param {import('../Uwave.js').default} uw
   * @param {import('ws').WebSocket} socket
   * @param {{ authRegistry: import('../AuthRegistry.js').default }} options
   */
  constructor(uw, socket, options) {
    super();
    this.uw = uw;
    this.socket = socket;
    this.options = options;
    this.#logger = uw.logger.child({ ns: 'uwave:sockets', connectionType: 'GuestConnection', userId: null });

    this.events = new Ultron(socket);

    this.events.on('close', () => {
      this.emit('close');
    });

    this.events.on('message', /** @param {string|Buffer} token */ (token) => {
      this.attemptAuth(token.toString()).then(() => {
        this.send('authenticated');
      }).catch((error) => {
        this.send('error', error.message);
      });
    });

    this.lastMessage = Date.now();
  }

  /**
   * @param {string} token
   * @private
   */
  async attemptAuth(token) {
    const { bans, users } = this.uw;
    const { authRegistry } = this.options;

    const userID = await authRegistry.getTokenUser(token);
    if (!userID || typeof userID !== 'string') {
      throw new Error('Invalid token');
    }
    const userModel = await users.getUser(userID);
    if (!userModel) {
      throw new Error('Invalid session');
    }

    // Users who are banned can still join as guests, but cannot log in. So we
    // ignore their socket login attempts, and just keep their connections
    // around as guest connections.
    if (await bans.isBanned(userModel)) {
      throw new Error('You have been banned');
    }

    this.emit('authenticate', userModel);
  }

  /**
   * @param {import('../schema.js').User} user
   */
  isReconnect(user) {
    return this.uw.redis.exists(`http-api:disconnected:${user.id}`);
  }

  /**
   * @param {string} command
   * @param {import('type-fest').JsonValue} [data]
   */
  send(command, data) {
    this.socket.send(JSON.stringify({ command, data }));
    this.lastMessage = Date.now();
  }

  ping() {
    if (Date.now() - this.lastMessage > 5000) {
      this.socket.send('-');
      this.lastMessage = Date.now();
    }
  }

  close() {
    this.#logger.info('close');
    this.socket.close();
  }

  removed() {
    this.events.remove();
  }

  // eslint-disable-next-line class-methods-use-this
  toString() {
    return 'Guest';
  }
}

export default GuestConnection;
