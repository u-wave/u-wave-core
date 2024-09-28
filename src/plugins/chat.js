import { randomUUID } from 'node:crypto';
import routes from '../routes/chat.js';

/**
 * @typedef {import('../schema.js').UserID} UserID
 * @typedef {import('../schema.js').User} User
 * @typedef {object} ChatOptions
 * @prop {number} maxLength
 */

/** @type {ChatOptions} */
const defaultOptions = {
  maxLength: 300,
};

class Chat {
  #uw;

  /** @type {ChatOptions} */
  #options;

  /**
   * @param {import('../Uwave.js').default} uw
   * @param {Partial<ChatOptions>} [options]
   */
  constructor(uw, options = {}) {
    this.#uw = uw;

    this.#options = {
      ...defaultOptions,
      ...options,
    };
  }

  /**
   * @param {User} user
   * @param {number} duration
   * @param {{ moderator: User }} options
   */
  async mute(user, duration, options) {
    await this.#uw.redis.set(
      `mute:${user.id}`,
      options.moderator.id,
      'PX',
      duration,
    );

    this.#uw.publish('chat:mute', {
      moderatorID: options.moderator.id,
      userID: user.id,
      duration,
    });
  }

  /**
   * @param {User} user
   * @param {{ moderator: User }} options
   */
  async unmute(user, options) {
    await this.#uw.redis.del(`mute:${user.id}`);

    this.#uw.publish('chat:unmute', {
      moderatorID: options.moderator.id,
      userID: user.id,
    });
  }

  /**
   * @param {User} user
   * @private
   */
  isMuted(user) {
    return this.#uw.redis.exists(`mute:${user.id}`);
  }

  /**
   * @param {string} message
   * @private
   */
  truncate(message) {
    return message.slice(0, this.#options.maxLength);
  }

  /**
   * @param {User} user
   * @param {string} message
   */
  async send(user, message) {
    if (await this.isMuted(user)) {
      return;
    }

    this.#uw.publish('chat:message', {
      id: randomUUID(),
      userID: user.id,
      message: this.truncate(message),
      timestamp: Date.now(),
    });
  }

  /**
   * @param {{ id: string } | { userID: UserID } | {}} filter
   * @param {{ moderator: User }} options
   */
  delete(filter, options) {
    const deletion = {
      filter: typeof filter === 'string' ? { id: filter } : filter,
      moderatorID: options.moderator.id,
    };

    this.#uw.publish('chat:delete', deletion);
  }
}

/**
 * @param {import('../Uwave.js').default} uw
 * @param {Partial<ChatOptions>} [options]
 */
async function chat(uw, options = {}) {
  uw.chat = new Chat(uw, options);
  uw.httpApi.use('/chat', routes());
}

export default chat;
export { Chat };
