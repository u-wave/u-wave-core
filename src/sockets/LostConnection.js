import EventEmitter from 'node:events';

class LostConnection extends EventEmitter {
  #logger;

  #expiresAt;

  #uw;

  /**
   * @param {import('../Uwave.js').default} uw
   * @param {import('../schema.js').User} user
   * @param {string} sessionID
   */
  constructor(uw, user, sessionID, timeout = 30) {
    super();
    this.#uw = uw;
    this.user = user;
    this.sessionID = sessionID;
    this.#expiresAt = Date.now() + timeout * 1_000;
    this.#logger = uw.logger.child({
      ns: 'uwave:sockets', connectionType: 'LostConnection', userID: this.user.id, sessionID,
    });

    this.#initQueued(timeout);
  }

  get #key() {
    return `http-api:disconnected:${this.sessionID}`;
  }

  get #messagesKey() {
    return `http-api:disconnected:${this.sessionID}:messages`;
  }

  /** @param {number} seconds */
  #initQueued(seconds) {
    // We expire the keys after timeout*10, because a server restart near the
    // end of the timeout might mean that someone fails to reconnect. This way
    // we can ensure that everyone still gets the full `timeout` duration to
    // reconnect after a server restart, while also not filling up Redis with
    // messages to users who left and will never return.
    this.#uw.redis.multi()
      .set(this.#key, 'true', 'EX', seconds * 10)
      .ltrim(this.#messagesKey, 0, 0)
      .expire(this.#messagesKey, seconds * 10)
      .exec();
  }

  /**
   * @param {string} command
   * @param {import('type-fest').JsonValue} data
   */
  send(command, data) {
    this.#logger.info({ command, data }, 'queue command');

    this.#uw.redis.rpush(
      this.#messagesKey,
      JSON.stringify({ command, data }),
    );
  }

  ping() {
    if (Date.now() > this.#expiresAt) {
      this.close();
      this.#uw.redis.del(this.#key, this.#messagesKey).catch(() => {
        // No big deal
      });
    }
  }

  close() {
    this.#logger.info('close');
    this.emit('close');
  }

  removed() {
    // Nothing to do
  }

  toString() {
    return `Lost { user: ${this.user.id} ${this.user.username} }`;
  }
}

export default LostConnection;
