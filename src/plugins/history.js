import lodash from 'lodash';
import Page from '../Page.js';

const { clamp } = lodash;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/**
 * @typedef {import('../models/History.js').HistoryMedia} HistoryMedia
 * @typedef {import('../models/index.js').HistoryEntry} HistoryEntry
 * @typedef {import('../models/index.js').User} User
 * @typedef {import('../models/index.js').Media} Media
 * @typedef {{ media: Media }} PopulateMedia
 * @typedef {{ user: User }} PopulateUser
 * @typedef {HistoryMedia & PopulateMedia} PopulatedHistoryMedia
 * @typedef {{ media: PopulatedHistoryMedia }} PopulateHistoryMedia
 * @typedef {HistoryEntry & PopulateUser & PopulateHistoryMedia} PopulatedHistoryEntry
 */

class HistoryRepository {
  #uw;

  /**
   * @param {import('../Uwave.js').default} uw
   */
  constructor(uw) {
    this.#uw = uw;
  }

  /**
   * @param {{ offset?: number, limit?: number }} [pagination]
   * @param {{ user?: string }} [options]
   * @returns {Promise<Page<PopulatedHistoryEntry, { offset: number, limit: number }>>}
   */
  async getHistory(pagination = {}, options = {}) {
    const { db } = this.#uw;

    const offset = pagination.offset ?? 0;
    const limit = clamp(
      typeof pagination.limit === 'number' ? pagination.limit : DEFAULT_PAGE_SIZE,
      0,
      MAX_PAGE_SIZE,
    );

    let query = db.selectFrom('historyEntries');
    if (options.user) {
      query = query.where('userID', '=', options.user);
    }

    const total = await query.select((eb) => eb.fn.countAll().as('count')).executeTakeFirstOrThrow();
    const historyEntries = await query
      .innerJoin('users', 'historyEntries.userID', 'users.id')
      .innerJoin('media', 'historyEntries.mediaID', 'media.id')
      .select([
        'historyEntries.id',
        'historyEntries.artist',
        'historyEntries.title',
        'historyEntries.start',
        'historyEntries.end',
        'historyEntries.createdAt as playedAt',
        'users.id as user.id',
        'users.username as user.username',
        'users.slug as user.slug',
        'users.createdAt as user.createdAt',
        'media.id as media.id',
        'media.artist as media.artist',
        'media.title as media.title',
        'media.thumbnail as media.thumbnail',
        'media.duration as media.duration',
        'media.sourceType as media.sourceType',
        'media.sourceID as media.sourceID',
        'media.sourceData as media.sourceData',
      ])
      .orderBy('historyEntries.createdAt', 'desc')
      .offset(offset)
      .limit(limit)
      .execute();
    console.log(historyEntries);

    return new Page(historyEntries, {
      pageSize: pagination ? pagination.limit : undefined,
      filtered: total,
      total,
      current: { offset, limit },
      next: pagination ? { offset: offset + limit, limit } : undefined,
      previous: offset > 0
        ? { offset: Math.max(offset - limit, 0), limit }
        : undefined,
    });
  }

  /**
   * @param {{ offset?: number, limit?: number }} [pagination]
   */
  getRoomHistory(pagination = {}) {
    return this.getHistory(pagination, {});
  }

  /**
   * @param {User} user
   * @param {{ offset?: number, limit?: number }} [pagination]
   */
  getUserHistory(user, pagination = {}) {
    return this.getHistory(pagination, { user: user._id });
  }
}

/**
 * @param {import('../Uwave.js').default} uw
 */
async function history(uw) {
  uw.history = new HistoryRepository(uw);
}

export default history;
export { HistoryRepository };
