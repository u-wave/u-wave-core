import EventEmitter from 'node:events';
import Ultron from 'ultron';
import WebSocket from 'ws';
import sjson from 'secure-json-parse';

class AuthedConnection extends EventEmitter {
  #logger;

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
    this.events = new Ultron(this.socket);
    this.user = user;
    this.sessionID = sessionID;
    this.#logger = uw.logger.child({
      ns: 'uwave:sockets', connectionType: 'AuthedConnection', userId: this.user.id, sessionID,
    });

    this.events.on('close', () => {
      this.emit('close', { banned: this.banned });
    });
    this.events.on('message', this.onMessage.bind(this));

    this.lastMessage = Date.now();
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
   * @private
   */
  onMessage(raw) {
    const { command, data } = sjson.safeParse(raw) ?? {};
    if (command) {
      this.emit('command', command, data);
    }
  }

  /**
   * @param {string} command
   * @param {import('type-fest').JsonValue} data
   */
  send(command, data) {
    this.socket.send(JSON.stringify({ command, data }));
    this.lastMessage = Date.now();
  }

  ping() {
    if (Date.now() - this.lastMessage > 5000 && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send('-');
      this.lastMessage = Date.now();
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
    this.events.remove();
  }

  toString() {
    return `Authed { user: ${this.user.id} ${this.user.username} }`;
  }
}

export default AuthedConnection;
