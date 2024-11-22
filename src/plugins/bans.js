import lodash from 'lodash';
import { UserNotFoundError } from '../errors/index.js';
import Page from '../Page.js';
import { now } from '../utils/sqlite.js';

const { clamp } = lodash;

class Bans {
  #uw;

  /**
   * @param {import('../Uwave.js').default} uw
   */
  constructor(uw) {
    this.#uw = uw;
  }

  /**
   * Check whether a user is currently banned.
   *
   * @param {import('../schema.js').User} user A user object.
   */

  async isBanned(user) {
    const { db } = this.#uw;

    const ban = await db.selectFrom('bans')
      .selectAll()
      .where('userID', '=', user.id)
      .where(({ or, eb }) => or([
        eb('expiresAt', 'is', null),
        eb('expiresAt', '>', now),
      ]))
      .executeTakeFirst();

    return ban != null;
  }

  /**
   * List banned users.
   *
   * @param {string} [filter] Optional filter to search for usernames.
   * @param {{ offset?: number, limit?: number }} [pagination] A pagination object.
   */
  async getBans(filter, pagination = {}) {
    const { db } = this.#uw;

    const offset = pagination.offset ?? 0;
    const size = clamp(
      pagination.limit == null ? 50 : pagination.limit,
      0,
      100,
    );

    let query = db.selectFrom('bans')
      .innerJoin('users', 'users.id', 'bans.userID')
      .leftJoin('users as mod', 'mod.id', 'bans.moderatorID')
      .select([
        'users.id as users.id',
        'users.username as users.username',
        'users.slug as users.slug',
        'users.createdAt as users.createdAt',
        'users.updatedAt as users.updatedAt',
        'mod.id as mod.id',
        'mod.username as mod.username',
        'mod.slug as mod.slug',
        'mod.createdAt as mod.createdAt',
        'mod.updatedAt as mod.updatedAt',
        'bans.reason',
        'bans.expiresAt',
        'bans.createdAt',
      ])
      .where(({ eb, or }) => or([
        eb('expiresAt', 'is', null),
        eb('expiresAt', '>', now),
      ]));

    if (filter) {
      query = query.where('users.username', 'like', filter);
    }

    const { total } = await db.selectFrom('bans').select(eb => eb.fn.countAll().as('total')).executeTakeFirstOrThrow();
    const { filtered } = await query.select(eb => eb.fn.countAll().as('filtered')).executeTakeFirstOrThrow();

    query = query.offset(offset).limit(size);

    const bannedUsers = await query.execute();
    const results = bannedUsers.map((row) => ({
      user: {
        id: row['users.id'],
        username: row['users.username'],
        slug: row['users.slug'],
        createdAt: row['users.createdAt'],
        updatedAt: row['users.updatedAt'],
      },
      moderator: row['mod.id'] != null ? {
        id: row['mod.id'],
        username: row['mod.username'],
        slug: row['mod.slug'],
        createdAt: row['mod.createdAt'],
        updatedAt: row['mod.updatedAt'],
      } : null,
      reason: row.reason,
      duration: row.expiresAt != null
        ? Math.floor(row.expiresAt.getTime() / 1_000 - row.createdAt.getTime() / 1_000) * 1_000
        : 0,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    }));

    return new Page(results, {
      pageSize: pagination ? pagination.limit : undefined,
      filtered: Number(filtered),
      total: Number(total),
      current: { offset, limit: size },
      next: pagination ? { offset: offset + size, limit: size } : undefined,
      previous: offset > 0
        ? { offset: Math.max(offset - size, 0), limit: size }
        : null,
    });
  }

  /**
   * @param {import('../schema.js').User} user
   * @param {object} options
   * @param {number} options.duration
   * @param {import('../schema.js').User} options.moderator
   * @param {boolean} [options.permanent]
   * @param {string} [options.reason]
   */
  async ban(user, {
    duration, moderator, permanent = false, reason = '',
  }) {
    const { db } = this.#uw;

    if (duration <= 0 && !permanent) {
      throw new Error('Ban duration should be at least 0ms.');
    }

    const createdAt = new Date(Math.floor(Date.now() / 1_000) * 1_000);
    const expiresAt = permanent ? null : new Date(createdAt.getTime() + duration);
    const ban = {
      userID: user.id,
      moderatorID: moderator.id,
      createdAt,
      expiresAt,
      reason: reason || null,
    };

    await db.insertInto('bans')
      .values(ban)
      .executeTakeFirstOrThrow();

    this.#uw.publish('user:ban', {
      userID: user.id,
      moderatorID: moderator.id,
      duration,
      expiresAt: ban.expiresAt ? ban.expiresAt.getTime() : null,
      permanent,
    });

    return ban;
  }

  /**
   * @param {import('../schema.js').UserID} userID
   * @param {object} options
   * @param {import('../schema.js').User} options.moderator
   */
  async unban(userID, { moderator }) {
    const { db, users } = this.#uw;

    const user = await users.getUser(userID);
    if (!user) {
      throw new UserNotFoundError({ id: userID });
    }

    const result = await db.deleteFrom('bans')
      .where('userID', '=', userID)
      .executeTakeFirst();
    if (result.numDeletedRows === 0n) {
      throw new Error(`User "${user.username}" is not banned.`);
    }

    this.#uw.publish('user:unban', {
      userID,
      moderatorID: moderator.id,
    });
  }
}

/**
 * @param {import('../Uwave.js').default} uw
 */
async function bans(uw) {
  uw.bans = new Bans(uw);
}

export default bans;
export { Bans };
