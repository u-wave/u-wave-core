import { randomUUID } from 'node:crypto';
import routes from '../routes/chat.js';
import { now } from '../utils/sqlite.js';

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
   * @param {number} duration - Duration in seconds
   * @param {{ moderator: User }} options
   */
  async mute(user, duration, options) {
    const { db } = this.#uw;

    const expiresAt = new Date(Date.now() + duration * 1000);
    await db.insertInto('mutes')
      .values({
        userID: user.id,
        moderatorID: options.moderator.id,
        expiresAt,
      })
      .execute();

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
    const { db } = this.#uw;

    await db.updateTable('mutes')
      .where('userID', '=', user.id)
      .where('expiresAt', '>', now)
      .set({ expiresAt: now, updatedAt: now })
      .execute();

    this.#uw.publish('chat:unmute', {
      moderatorID: options.moderator.id,
      userID: user.id,
    });
  }

  /**
   * @param {User} user
   * @private
   */
  async isMuted(user) {
    const { db } = this.#uw;

    const mute = await db.selectFrom('mutes')
      .where('userID', '=', user.id)
      .where('expiresAt', '>', now)
      .selectAll()
      .executeTakeFirst();

    return mute ?? null;
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
