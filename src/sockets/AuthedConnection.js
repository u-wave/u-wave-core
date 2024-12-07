import EventEmitter from 'node:events';
import Ultron from 'ultron';
import WebSocket from 'ws';
import sjson from 'secure-json-parse';

const PING_TIMEOUT = 5_000;
const DEAD_TIMEOUT = 30_000;

class AuthedConnection extends EventEmitter {
  #events;

  #logger;

  #lastMessage = Date.now();

  /**
   * @param {import('../Uwave.js').default} uw
   * @param {import('ws').WebSocket} socket
   * @param {import('../schema.js').User} user
   * @param {string} sessionID
   */
  constructor(uw, socket, user, sessionID) {
    super();
    this.uw = uw;
    this.socket = socket;
    this.#events = new Ultron(this.socket);
    this.user = user;
    this.sessionID = sessionID;
    this.#logger = uw.logger.child({
      ns: 'uwave:sockets', connectionType: 'AuthedConnection', userId: this.user.id, sessionID,
    });

    this.#events.on('close', () => {
      this.emit('close', { banned: this.banned });
    });
    this.#events.on('message', (raw) => {
      this.#onMessage(raw);
    });
    this.#events.on('pong', () => {
      this.#onPong();
    });

    this.sendWaiting();
  }

  /**
   * @private
   */
  get key() {
    return `http-api:disconnected:${this.sessionID}`;
  }

  /**
   * @private
   */
  get messagesKey() {
    return `http-api:disconnected:${this.sessionID}:messages`;
  }

  /**
   * @private
   */
  async sendWaiting() {
    const wasDisconnected = await this.uw.redis.exists(this.key);
    if (!wasDisconnected) {
      return;
    }
    /** @type {string[]} */
    const messages = await this.uw.redis.lrange(this.messagesKey, 0, -1);
    this.#logger.info({ count: messages.length }, 'queued messages');
    messages.forEach((message) => {
      const { command, data } = sjson.parse(message);
      this.send(command, data);
    });
    await this.uw.redis.del(this.key, this.messagesKey);
  }

  /**
   * @param {string|Buffer} raw
   */
  #onMessage(raw) {
    this.#lastMessage = Date.now();
    const { command, data } = sjson.safeParse(raw) ?? {};
    if (command) {
      this.emit('command', command, data);
    }
  }

  #onPong() {
    this.#lastMessage = Date.now();
  }

  /**
   * @param {string} command
   * @param {import('type-fest').JsonValue} data
   */
  send(command, data) {
    this.socket.send(JSON.stringify({ command, data }));
    this.#lastMessage = Date.now();
  }

  #timeSinceLastMessage() {
    return Date.now() - this.#lastMessage;
  }

  ping() {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    if (this.#timeSinceLastMessage() > DEAD_TIMEOUT) {
      this.socket.terminate();
      return;
    }
    if (this.#timeSinceLastMessage() > PING_TIMEOUT) {
      this.socket.ping();
    }
  }

  ban() {
    this.#logger.info('ban');
    this.banned = true;
    this.send('error', 'You have been banned');
    this.socket.close(4001, 'ban');
  }

  close() {
    this.#logger.info('close');
    this.socket.close();
  }

  removed() {
    this.#events.remove();
  }

  toString() {
    return `Authed { user: ${this.user.id} ${this.user.username} }`;
  }
}

export default AuthedConnection;
