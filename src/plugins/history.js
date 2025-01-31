import lodash from 'lodash';
import Page from '../Page.js';
import { fromJson, json, jsonb } from '../utils/sqlite.js';

const { clamp } = lodash;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/** @typedef {import('../schema.js').Database} Database */

const historyEntrySelection = /** @type {const} */ ([
  'historyEntries.id',
  'historyEntries.artist',
  'historyEntries.title',
  'historyEntries.start',
  'historyEntries.end',
  /** @param {import('kysely').ExpressionBuilder<Database, 'historyEntries'>} eb */
  (eb) => json(eb.fn.coalesce(eb.ref('historyEntries.sourceData'), jsonb(null))).as('sourceData'),
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
  /** @param {import('kysely').ExpressionBuilder<Database, 'media'>} eb */
  (eb) => json(eb.fn.coalesce(eb.ref('media.sourceData'), jsonb(null))).as('media.sourceData'),
  /** @param {import('kysely').ExpressionBuilder<Database, 'historyEntries'>} eb */
  (eb) => eb.selectFrom('feedback')
    .where('historyEntryID', '=', eb.ref('historyEntries.id'))
    .where('vote', '=', 1)
    .select((eb) => eb.fn.agg('json_group_array', ['userID']).as('userIDs'))
    .as('upvotes'),
  /** @param {import('kysely').ExpressionBuilder<Database, 'historyEntries'>} eb */
  (eb) => eb.selectFrom('feedback')
    .where('historyEntryID', '=', eb.ref('historyEntries.id'))
    .where('vote', '=', -1)
    .select((eb) => eb.fn.agg('json_group_array', ['userID']).as('userIDs'))
    .as('downvotes'),
  /** @param {import('kysely').ExpressionBuilder<Database, 'historyEntries'>} eb */
  (eb) => eb.selectFrom('feedback')
    .where('historyEntryID', '=', eb.ref('historyEntries.id'))
    .where('favorite', '=', 1)
    .select((eb) => eb.fn.agg('json_group_array', ['userID']).as('userIDs'))
    .as('favorites'),
]);

/**
 * @param {{
 *   id: HistoryEntryID,
 *   artist: string,
 *   title: string,
 *   start: number,
 *   end: number,
 *   sourceData: import('../utils/sqlite.js').SerializedJSON<import('type-fest').JsonObject | null>,
 *   playedAt: Date,
 *   'user.id': UserID,
 *   'user.username': string,
 *   'user.slug': string,
 *   'user.createdAt': Date,
 *   'media.id': MediaID,
 *   'media.sourceType': string,
 *   'media.sourceID': string,
 *   'media.sourceData': import('../utils/sqlite.js').SerializedJSON<
 *       import('type-fest').JsonObject | null>,
 *   'media.artist': string,
 *   'media.title': string,
 *   'media.thumbnail': string,
 *   'media.duration': number,
 *   upvotes: import('../utils/sqlite.js').SerializedJSON<UserID>,
 *   downvotes: import('../utils/sqlite.js').SerializedJSON<UserID>,
 *   favorites: import('../utils/sqlite.js').SerializedJSON<UserID>,
 * }} row
 */
function historyEntryFromRow(row) {
  return {
    _id: row.id,
    playedAt: row.playedAt,
    user: {
      _id: row['user.id'],
      username: row['user.username'],
      slug: row['user.slug'],
      createdAt: row['user.createdAt'],
    },
    media: {
      artist: row.artist,
      title: row.title,
      start: row.start,
      end: row.end,
      sourceData: row.sourceData,
      media: {
        _id: row['media.id'],
        sourceType: row['media.sourceType'],
        sourceID: row['media.sourceID'],
        sourceData: row['media.sourceData'],
        artist: row['media.artist'],
        title: row['media.title'],
        thumbnail: row['media.thumbnail'],
        duration: row['media.duration'],
      },
    },
    upvotes: fromJson(row.upvotes),
    downvotes: fromJson(row.downvotes),
    favorites: fromJson(row.favorites),
  };
}

/**
 * @typedef {import('../schema.js').UserID} UserID
 * @typedef {import('../schema.js').MediaID} MediaID
 * @typedef {import('../schema.js').HistoryEntryID} HistoryEntryID
 * @typedef {import('../schema.js').HistoryEntry} HistoryEntry
 * @typedef {import('../schema.js').User} User
 * @typedef {import('../schema.js').Media} Media
 */

class HistoryRepository {
  #uw;

  /**
   * @param {import('../Uwave.js').default} uw
   */
  constructor(uw) {
    this.#uw = uw;
  }

  /** @param {HistoryEntryID} id */
  async getEntry(id) {
    const { db } = this.#uw;

    const row = await db.selectFrom('historyEntries')
      .innerJoin('users', 'historyEntries.userID', 'users.id')
      .innerJoin('media', 'historyEntries.mediaID', 'media.id')
      .select(historyEntrySelection)
      .where('historyEntries.id', '=', id)
      .executeTakeFirst();

    return row != null ? historyEntryFromRow(row) : null;
  }

  /**
   * @param {{ offset?: number, limit?: number }} [pagination]
   * @param {{ user?: UserID }} [options]
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
    const rows = await query
      .innerJoin('users', 'historyEntries.userID', 'users.id')
      .innerJoin('media', 'historyEntries.mediaID', 'media.id')
      .select(historyEntrySelection)
      .orderBy('historyEntries.createdAt', 'desc')
      .offset(offset)
      .limit(limit)
      .execute();

    const historyEntries = rows.map(historyEntryFromRow);

    return new Page(historyEntries, {
      pageSize: pagination ? pagination.limit : undefined,
      filtered: Number(total.count),
      total: Number(total.count),
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
    return this.getHistory(pagination, { user: user.id });
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
