import lodash from 'lodash';
import ObjectGroupBy from 'object.groupby';
import {
  PlaylistNotFoundError,
  ItemNotInPlaylistError,
  MediaNotFoundError,
  UserNotFoundError,
} from '../errors/index.js';
import Page from '../Page.js';
import routes from '../routes/playlists.js';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';

const { shuffle } = lodash;

/**
 * @typedef {import('../schema.js').UserID} UserID
 * @typedef {import('../schema.js').MediaID} MediaID
 * @typedef {import('../schema.js').PlaylistID} PlaylistID
 * @typedef {import('../schema.js').PlaylistItemID} PlaylistItemID
 *
 * @typedef {import('../schema.js').User} User
 * @typedef {import('../schema.js').Playlist} Playlist
 * @typedef {import('../schema.js').PlaylistItem} PlaylistItem
 * @typedef {import('../schema.js').Media} Media
 *
 * @typedef {import('mongoose').PipelineStage} PipelineStage
 * @typedef {import('mongoose').PipelineStage.Facet['$facet'][string]} FacetPipelineStage
 */

/**
 * @typedef {object} PlaylistItemDesc
 * @prop {string} sourceType
 * @prop {string|number} sourceID
 * @prop {string} [artist]
 * @prop {string} [title]
 * @prop {number} [start]
 * @prop {number} [end]
 */

/**
 * @param {PlaylistItemDesc} item
 * @returns {boolean}
 */
function isValidPlaylistItem(item) {
  return typeof item === 'object'
    && typeof item.sourceType === 'string'
    && (typeof item.sourceID === 'string' || typeof item.sourceID === 'number');
}

/**
 * Calculate valid start/end times for a playlist item.
 *
 * @param {PlaylistItemDesc} item
 * @param {Media} media
 */
function getStartEnd(item, media) {
  let { start, end } = item;
  if (!start || start < 0) {
    start = 0;
  } else if (start > media.duration) {
    start = media.duration;
  }
  if (!end || end > media.duration) {
    end = media.duration;
  } else if (end < start) {
    end = start;
  }
  return { start, end };
}

/**
 * @param {PlaylistItemDesc} itemProps
 * @param {Media} media
 */
function toPlaylistItem(itemProps, media) {
  const { artist, title } = itemProps;
  const { start, end } = getStartEnd(itemProps, media);
  return {
    mediaID: media.id,
    artist: artist ?? media.artist,
    title: title ?? media.title,
    start,
    end,
  };
}

const playlistItemSelection = /** @type {const} */ ([
  'playlistItems.id as id',
  'media.id as media.id',
  'media.sourceID as media.sourceID',
  'media.sourceType as media.sourceType',
  'media.sourceData as media.sourceData',
  'media.artist as media.artist',
  'media.title as media.title',
  'media.duration as media.duration',
  'media.thumbnail as media.thumbnail',
  'playlistItems.artist',
  'playlistItems.title',
  'playlistItems.start',
  'playlistItems.end',
])

/**
 * @param {{
 *   id: PlaylistItemID,
 *   'media.id': MediaID,
 *   'media.sourceID': string,
 *   'media.sourceType': string,
 *   'media.sourceData': import('type-fest').JsonObject | null,
 *   'media.artist': string,
 *   'media.title': string,
 *   'media.duration': number,
 *   'media.thumbnail': string,
 *   artist: string,
 *   title: string,
 *   start: number,
 *   end: number,
 * }} raw
 */
function playlistItemFromSelection (raw) {
  return {
    _id: raw.id,
    artist: raw.artist,
    title: raw.title,
    start: raw.start,
    end: raw.end,
    media: {
      _id: raw['media.id'],
      artist: raw['media.artist'],
      title: raw['media.title'],
      duration: raw['media.duration'],
      thumbnail: raw['media.thumbnail'],
      sourceID: raw['media.sourceID'],
      sourceType: raw['media.sourceType'],
      sourceData: raw['media.sourceData'],
    },
  }
}

class PlaylistsRepository {
  #uw;

  #logger;

  /**
   * @param {import('../Uwave.js').default} uw
   */
  constructor(uw) {
    this.#uw = uw;
    this.#logger = uw.logger.child({ ns: 'uwave:playlists' });
  }

  /**
   * @param {User} user
   * @param {PlaylistID} id
   */
  async getUserPlaylist(user, id) {
    const { db } = this.#uw;

    const playlist = await db.selectFrom('playlists')
      .leftJoin('playlistItems', 'playlistItems.playlistID', 'playlists.id')
      .where('userID', '=', user.id)
      .where('playlists.id', '=', id)
      .groupBy('playlists.id')
      .select([
        'playlists.id',
        'playlists.userID',
        'playlists.name',
        'playlists.createdAt',
        'playlists.updatedAt',
        db.fn.countAll().as('size'),
      ])
      .executeTakeFirst();

    if (!playlist) {
      throw new PlaylistNotFoundError({ id });
    }
    return {
      ...playlist,
      size: Number(playlist.size),
    };
  }

  /**
   * @param {User} user
   * @param {{ name: string }} options
   */
  async createPlaylist(user, { name }) {
    const { db } = this.#uw;
    const id = /** @type {PlaylistID} */ (randomUUID());

    const playlist = await db.insertInto('playlists')
      .values({
        id,
        name,
        userID: user.id,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // If this is the user's first playlist, immediately activate it.
    if (user.activePlaylistID == null) {
      this.#logger.info({ userId: user.id, playlistId: playlist.id }, 'activating first playlist');
      await db.updateTable('users')
        .where('users.id', '=', user.id)
        .set({ activePlaylistID: playlist.id })
        .execute();
    }

    return playlist;
  }

  /**
   * @param {User} user
   */
  async getUserPlaylists(user) {
    const { db } = this.#uw;

    const playlists = await db.selectFrom('playlists')
      .leftJoin('playlistItems', 'playlistItems.playlistID', 'playlists.id')
      .where('userID', '=', user.id)
      .select(['playlists.id', 'name', db.fn.countAll().as('size'), 'playlists.createdAt'])
      .groupBy('playlists.id')
      .execute();

    return playlists.map((playlist) => {
      return { ...playlist, size: Number(playlist.size) };
    });
  }

  /**
   * @param {Playlist} playlist
   * @param {Partial<Playlist>} patch
   * @returns {Promise<Playlist>}
   */
  // eslint-disable-next-line class-methods-use-this
  async updatePlaylist(playlist, patch = {}) {
    Object.assign(playlist, patch);
    await playlist.save();
    return playlist;
  }

  /**
   * @param {Playlist} playlist
   */
  async shufflePlaylist(playlist) {
    const { db } = this.#uw;

    const previousOrder = await db.selectFrom('playlistItems')
      .where('playlistID', '=', playlist.id)
      .select(['id'])
      .orderBy('order', 'asc')
      .execute();

    const newOrder = shuffle(previousOrder);
    await db.transaction().execute(async (tx) => {
      await Promise.all(newOrder.map((item, order) => (
        tx.updateTable('playlistItems')
          .where('id', '=', item.id)
          .set({ order })
          .executeTakeFirst()
      )));
    });
  }

  /**
   * @param {Playlist} playlist
   */
  async deletePlaylist(playlist) {
    const { db } = this.#uw;

    await db.deleteFrom('playlists')
      .where('id', '=', playlist.id)
      .execute();
  }

  /**
   * @param {Playlist} playlist
   * @param {PlaylistItemID} itemID
   */
  async getPlaylistItem(playlist, itemID) {
    const { db } = this.#uw;

    const raw = await db.selectFrom('playlistItems')
      .where('playlistItems.id', '=', itemID)
      .where('playlistItems.playlistID', '=', playlist.id)
      .innerJoin('media', 'media.id', 'playlistItems.mediaID')
      .select(playlistItemSelection)
      .executeTakeFirst();

    if (raw == null) {
      throw new ItemNotInPlaylistError({ playlistID: playlist.id, itemID });
    }

    return playlistItemFromSelection(raw)
  }

  /**
   * @param {Playlist} playlist
   * @param {number} order
   */
  async getPlaylistItemAt(playlist, order) {
    const { db } = this.#uw;

    const raw = await db.selectFrom('playlistItems')
      .where('playlistItems.playlistID', '=', playlist.id)
      .where('playlistItems.order', '=', order)
      .innerJoin('media', 'media.id', 'playlistItems.mediaID')
      .select(playlistItemSelection)
      .executeTakeFirst();

    if (raw == null) {
      throw new ItemNotInPlaylistError({ playlistID: playlist.id });
    }

    return playlistItemFromSelection(raw)
  }

  /**
   * @param {{ id: PlaylistID }} playlist
   * @param {string|undefined} filter
   * @param {{ offset: number, limit: number }} pagination
   */
  async getPlaylistItems(playlist, filter, pagination) {
    const { db } = this.#uw;

    let query = db.selectFrom('playlistItems')
      .where('playlistID', '=', playlist.id)
      .innerJoin('media', 'playlistItems.mediaID', 'media.id')
      .select(playlistItemSelection);
    if (filter != null) {
      query = query.where('playlistItems.artist', 'like', filter)
        .orWhere('playlistItems.title', 'like', filter);
    }

    query = query
      .offset(pagination.offset)
      .limit(pagination.limit);

    const totalQuery = db.selectFrom('playlistItems')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('playlistID', '=', playlist.id);

    const filteredQuery = filter == null ? totalQuery : db.selectFrom('playlistItems')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('playlistID', '=', playlist.id)
      .where('playlistItems.artist', 'like', filter)
      .orWhere('playlistItems.artist', 'like', filter);

    query = query.orderBy('playlistItems.order', 'asc');

    const [
      playlistItemsRaw,
      filtered,
      total,
    ] = await Promise.all([
      query.execute(),
      filteredQuery.executeTakeFirstOrThrow(),
      totalQuery.executeTakeFirstOrThrow(),
    ]);

    const playlistItems = playlistItemsRaw.map(playlistItemFromSelection)

    // `items` is the same shape as a PlaylistItem instance!
    return new Page(playlistItems, {
      pageSize: pagination.limit,
      filtered: Number(filtered.count),
      total: Number(total.count),

      current: pagination,
      next: {
        offset: pagination.offset + pagination.limit,
        limit: pagination.limit,
      },
      previous: {
        offset: Math.max(pagination.offset - pagination.limit, 0),
        limit: pagination.limit,
      },
    });
  }

  /**
   * Get playlists containing a particular Media.
   *
   * @typedef {object} GetPlaylistsContainingMediaOptions
   * @prop {UserID} [author]
   * @prop {string[]} [fields]
   *
   * @param {MediaID} mediaID
   * @param {GetPlaylistsContainingMediaOptions} options
   */
  async getPlaylistsContainingMedia(mediaID, options = {}) {
    const { db } = this.#uw;

    let query = db.selectFrom('playlists')
      .select(['playlists.id', 'playlists.name', 'playlists.createdAt'])
      .innerJoin('playlistItems', 'playlists.id', 'playlistItems.playlistID')
      .where('playlistItems.mediaID', '=', mediaID)
      .groupBy('playlistItems.playlistID')
    if (options.author) {
      query = query.where('playlists.userID', '=', options.author)
    }

    const playlists = await query.execute();
    return playlists;
  }

  /**
   * Get playlists that contain any of the given medias. If multiple medias are in a single
   * playlist, that playlist will be returned multiple times, keyed on the media's unique ObjectId.
   *
   * @param {MediaID[]} mediaIDs
   * @param {{ author?: UserID }} options
   * @returns A map of stringified `Media` `ObjectId`s to the Playlist objects that contain them.
   */
  async getPlaylistsContainingAnyMedia(mediaIDs, options = {}) {
    const { db } = this.#uw;

    if (mediaIDs.length === 0) {
      return new Map();
    }

    let query = db.selectFrom('playlists')
      .innerJoin('playlistItems', 'playlists.id', 'playlistItems.playlistID')
      .select(['playlists.id', 'playlists.name', 'playlists.createdAt', 'playlistItems.mediaID'])
      .where('playlistItems.mediaID', 'in', mediaIDs);
    if (options.author) {
      query = query.where('playlists.userID', '=', options.author)
    }

    const playlists = await query.execute();

    const playlistsByMediaID = new Map();
    playlists.forEach(({ mediaID, ...playlist }) => {
      const playlists = playlistsByMediaID.get(mediaID);
      if (playlists) {
        playlists.push(playlist);
      } else {
        playlistsByMediaID.set(mediaID, [playlist]);
      }
    });

    return playlistsByMediaID;
  }

  /**
   * Bulk create playlist items from arbitrary sources.
   *
   * @param {User} user
   * @param {PlaylistItemDesc[]} items
   */
  async createPlaylistItems(user, items) {
    const { db } = this.#uw;

    if (!items.every(isValidPlaylistItem)) {
      throw new Error('Cannot add a playlist item without a proper media source type and ID.');
    }

    // Group by source so we can retrieve all unknown medias from the source in
    // one call.
    const itemsBySourceType = ObjectGroupBy(items, (item) => item.sourceType);
    /** @type {{ mediaID: MediaID, artist: string, title: string, start: number, end: number }[]} */
    const playlistItems = [];
    const promises = Object.entries(itemsBySourceType).map(async ([sourceType, sourceItems]) => {
      const knownMedias = await db.selectFrom('media')
        .where('sourceType', '=', sourceType)
        .where('sourceID', 'in', sourceItems.map((item) => String(item.sourceID)))
        .selectAll()
        .execute();

      /** @type {Set<string>} */
      const knownMediaIDs = new Set();
      knownMedias.forEach((knownMedia) => {
        knownMediaIDs.add(knownMedia.sourceID);
      });

      /** @type {string[]} */
      const unknownMediaIDs = [];
      sourceItems.forEach((item) => {
        if (!knownMediaIDs.has(String(item.sourceID))) {
          unknownMediaIDs.push(String(item.sourceID));
        }
      });

      let allMedias = knownMedias;
      if (unknownMediaIDs.length > 0) {
        // @ts-expect-error TS2322
        const unknownMedias = await this.#uw.source(sourceType)
          .get(user, unknownMediaIDs);
        const inserted = await db.insertInto('media')
          .values(unknownMedias.map((media) => ({
            sourceType: media.sourceType,
            sourceID: media.sourceID,
            sourceData: media.sourceData,
            artist: media.artist,
            title: media.title,
            duration: media.duration,
            thumbnail: media.thumbnail,
          })))
          .returningAll()
          .execute();
        allMedias = allMedias.concat(inserted);
      }

      for (const item of sourceItems) {
        const media = allMedias.find((compare) => compare.sourceID === String(item.sourceID));
        if (!media) {
          throw new MediaNotFoundError({ sourceType: item.sourceType, sourceID: item.sourceID });
        }
        const { start, end } = getStartEnd(item, media);
        playlistItems.push({
          playlistID: playlist.id,
          mediaID: media.id,
          artist: item.artist ?? media.artist,
          title: item.title ?? media.title,
          start,
          end,
        });
      }
    });

    await Promise.all(promises);

    if (playlistItems.length === 0) {
      return [];
    }

    await db.insertInto('playlistItems')
      .values(playlistItems)
      .returningAll()
      .execute();
  }

  /**
   * Add items to a playlist.
   *
   * @param {Playlist} playlist
   * @param {PlaylistItemDesc[]} items
   * @param {{ after?: PlaylistItemID|null }} options
   * @returns {Promise<{
   *   added: PlaylistItem[],
   *   afterID: PlaylistItemID?,
   *   playlistSize: number,
   * }>}
   */
  async addPlaylistItems(playlist, items, { after = null } = {}) {
    const { users } = this.#uw;
    const user = await users.getUser(playlist.userID);
    if (!user) {
      throw new UserNotFoundError({ id: playlist.userID });
    }

    const newItems = await this.createPlaylistItems(user, items);
    const oldMedia = playlist.media;
    const insertIndex = after === null ? -1 : oldMedia.indexOf(after);
    playlist.media = [
      ...oldMedia.slice(0, insertIndex + 1),
      ...newItems.map((item) => item.id),
      ...oldMedia.slice(insertIndex + 1),
    ];

    await playlist.save();

    return {
      added: newItems,
      afterID: after,
      playlistSize: playlist.media.length,
    };
  }

  /**
   * @param {PlaylistItem} item
   * @param {object} patch
   * @returns {Promise<PlaylistItem>}
   */
  // eslint-disable-next-line class-methods-use-this
  async updatePlaylistItem(item, patch = {}) {
    Object.assign(item, patch);
    await item.save();
    return item;
  }

  /**
   * @param {Playlist} playlist
   * @param {PlaylistItemID[]} itemIDs
   * @param {{ afterID: PlaylistItemID | null }} options
   */
  // eslint-disable-next-line class-methods-use-this
  async movePlaylistItems(playlist, itemIDs, { afterID }) {
    const { db } = this.#uw;

    const distance = itemIDs.length;
    await db.transaction().execute(async (tx) => {
      let query = tx.updateTable('playlistItems')
        .where('playlistID', '=', playlist.id)
        .where('id', 'not in', itemIDs)
        .set({ order: (eb) => sql`${eb.ref('order')} + ${distance}` });
      if (afterID) {
        query = query.where('order', '>', (eb) => (
          eb.selectFrom('playlistItems').where('id', '=', afterID).select('order')
        ));
      }

      query = query.returning([
        afterID ? ((eb) => eb.selectFrom('playlistItems')
          .where('id', '=', afterID)
          .select('order')
          .as('insertAt')) : sql`0`.as('insertAt'),
      ]);

      const { insertAt } = await query.executeTakeFirstOrThrow();

      await Promise.all(itemIDs.map((playlistItemID, order) => (
        tx.updateTable('playlistItems')
          .where('id', '=', playlistItemID)
          .set({ order: insertAt + order })
          .executeTakeFirst()
      )));
    });

    return {};
  }

  /**
   * @param {Playlist} playlist
   * @param {PlaylistItemID[]} itemIDs
   */
  async removePlaylistItems(playlist, itemIDs) {
    const { PlaylistItem } = this.#uw.models;

    // Only remove items that are actually in this playlist.
    const stringIDs = new Set(itemIDs.map((item) => String(item)));
    /** @type {PlaylistItemID[]} */
    const toRemove = [];
    /** @type {PlaylistItemID[]} */
    const toKeep = [];
    playlist.media.forEach((itemID) => {
      if (stringIDs.has(`${itemID}`)) {
        toRemove.push(itemID);
      } else {
        toKeep.push(itemID);
      }
    });

    playlist.media = toKeep;
    await playlist.save();
    await PlaylistItem.deleteMany({ _id: { $in: toRemove } });

    return {};
  }
}

/**
 * @param {import('../Uwave.js').default} uw
 */
async function playlistsPlugin(uw) {
  uw.playlists = new PlaylistsRepository(uw);
  uw.httpApi.use('/playlists', routes());
}

export default playlistsPlugin;
export { PlaylistsRepository };
