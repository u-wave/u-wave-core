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
   * @param {object|null} filter
   * @param {{ offset?: number, limit?: number }} [pagination]
   * @returns {Promise<Page<PopulatedHistoryEntry, { offset: number, limit: number }>>}
   */
  async getHistory(filter, pagination = {}) {
    const { HistoryEntry } = this.#uw.models;

    const offset = pagination.offset ?? 0;
    const limit = clamp(
      typeof pagination.limit === 'number' ? pagination.limit : DEFAULT_PAGE_SIZE,
      0,
      MAX_PAGE_SIZE,
    );

    const total = filter != null
      ? await HistoryEntry.where(filter).countDocuments()
      : await HistoryEntry.estimatedDocumentCount();
    /** @type {import('mongoose').PipelineStage[]} */
    const aggregate = [];
    if (filter != null) {
      aggregate.push({ $match: filter });
    }
    aggregate.push(
      { $sort: { playedAt: -1 } },
      { $skip: offset },
      { $limit: limit },
      {
        $lookup: {
          from: 'media',
          localField: 'media.media',
          foreignField: '_id',
          as: 'media.media',
        },
      },
      { $unwind: '$media.media' },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      { $project: { __v: 0, 'media.media.__v': 0, 'user.__v': 0 } },
    );
    const query = HistoryEntry.aggregate(aggregate);

    /** @type {PopulatedHistoryEntry[]} */
    const results = /** @type {any} */ (await query);

    return new Page(results, {
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
    return this.getHistory(null, pagination);
  }

  /**
   * @param {User} user
   * @param {{ offset?: number, limit?: number }} [pagination]
   */
  getUserHistory(user, pagination = {}) {
    return this.getHistory({ user: user._id }, pagination);
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
