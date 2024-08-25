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
import { arrayCycle, jsonb, jsonEach, jsonLength, arrayShuffle as arrayShuffle } from '../utils/sqlite.js';

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
 */

/**
 * @typedef {object} PlaylistItemDesc
 * @prop {string} sourceType
 * @prop {string} sourceID
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
      .where('userID', '=', user.id)
      .where('id', '=', id)
      .select([
        'id',
        'userID',
        'name',
        'createdAt',
        'updatedAt',
        (eb) => jsonLength(eb.ref('items')).as('size'),
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
      .where('userID', '=', user.id)
      .select([
        'id',
        'name',
        (eb) => jsonLength(eb.ref('items')).as('size'),
        'createdAt',
      ])
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
   * "Cycle" the playlist, moving its first item to last.
   *
   * @param {Playlist} playlist
   */
  async cyclePlaylist(playlist) {
    const { db } = this.#uw;

    await db.updateTable('playlists')
      .where('id', '=', playlist.id)
      .set('items', (eb) => arrayCycle(eb.ref('items')))
      .execute();
  }

  /**
   * @param {Playlist} playlist
   */
  async shufflePlaylist(playlist) {
    const { db } = this.#uw;

    await db.updateTable('playlists')
      .where('id', '=', playlist.id)
      .set('items', (eb) => arrayShuffle(eb.ref('items')))
      .execute();
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
      .where('playlistItems.id', '=', (eb) => {
        /** @type {import('kysely').RawBuilder<PlaylistItemID>} */
        const item =  sql`items->>${order}`
        return eb.selectFrom('playlists')
          .select(item.as('playlistItemID'))
          .where('id', '=', playlist.id)
      })
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

    let query = db.selectFrom('playlists')
      .innerJoin(
        (eb) => jsonEach(eb.ref('playlists.items')).as('playlistItemIDs'),
        (join) => join,
      )
      .innerJoin('playlistItems', (join) => join.on((eb) => eb(
        eb.ref('playlistItemIDs.value'),
        '=',
        eb.ref('playlistItems.id'),
      )))
      .innerJoin('media', 'playlistItems.mediaID', 'media.id')
      .where('playlists.id', '=', playlist.id)
      .select(playlistItemSelection);
    if (filter != null) {
      query = query.where((eb) => eb.or([
        eb('playlistItems.artist', 'like', filter),
        eb('playlistItems.title', 'like', filter),
      ]));
    }

    query = query
      .offset(pagination.offset)
      .limit(pagination.limit);

    const totalQuery = db.selectFrom('playlists')
      .select((eb) => jsonLength(eb.ref('items')).as('count'))
      .where('id', '=', playlist.id)
      .executeTakeFirstOrThrow();

    const filteredQuery = filter == null ? totalQuery : db.selectFrom('playlistItems')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('playlistID', '=', playlist.id)
      .where((eb) => eb.or([
        eb('playlistItems.artist', 'like', filter),
        eb('playlistItems.title', 'like', filter),
      ]))
      .executeTakeFirstOrThrow();

    const [
      playlistItemsRaw,
      filtered,
      total,
    ] = await Promise.all([
      query.execute(),
      filteredQuery,
      totalQuery,
    ]);

    const playlistItems = playlistItemsRaw.map(playlistItemFromSelection);

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
   * Load media for all the given source type/source IDs.
   *
   * @param {User} user
   * @param {{ sourceType: string, sourceID: string }[]} items
   */
  async resolveMedia(user, items) {
    const { db } = this.#uw;

    // Group by source so we can retrieve all unknown medias from the source in
    // one call.
    const itemsBySourceType = ObjectGroupBy(items, (item) => item.sourceType);
    /** @type {Map<string, Media>} */
    const allMedias = new Map();
    const promises = Object.entries(itemsBySourceType).map(async ([sourceType, sourceItems]) => {
      const knownMedias = await db.selectFrom('media')
        .where('sourceType', '=', sourceType)
        .where('sourceID', 'in', sourceItems.map((item) => String(item.sourceID)))
        .selectAll()
        .execute();

      /** @type {Set<string>} */
      const knownMediaIDs = new Set();
      knownMedias.forEach((knownMedia) => {
        allMedias.set(`${knownMedia.sourceType}:${knownMedia.sourceID}`, knownMedia);
        knownMediaIDs.add(knownMedia.sourceID);
      });

      /** @type {string[]} */
      const unknownMediaIDs = [];
      sourceItems.forEach((item) => {
        if (!knownMediaIDs.has(String(item.sourceID))) {
          unknownMediaIDs.push(String(item.sourceID));
        }
      });

      if (unknownMediaIDs.length > 0) {
        // @ts-expect-error TS2322
        const unknownMedias = await this.#uw.source(sourceType)
          .get(user, unknownMediaIDs);
        const toInsert = unknownMedias.map((media) => /** @type {Media} */ ({
          id: /** @type {MediaID} */ (randomUUID()),
          sourceType: media.sourceType,
          sourceID: media.sourceID,
          sourceData: jsonb(media.sourceData),
          artist: media.artist,
          title: media.title,
          duration: media.duration,
          thumbnail: media.thumbnail,
        }));
        const inserted = await db.insertInto('media')
          .values(toInsert)
          .returningAll()
          .execute();

        for (const media of inserted) {
          allMedias.set(`${media.sourceType}:${media.sourceID}`, media);
        }
      }
    });

    await Promise.all(promises);

    for (const item of items) {
      if (!allMedias.has(`${item.sourceType}:${item.sourceID}`)) {
        throw new MediaNotFoundError({ sourceType: item.sourceType, sourceID: item.sourceID });
      }
    }

    return allMedias;
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

    const medias = await this.resolveMedia(user, items);
    const playlistItems = items.map((item) => {
      const media = medias.get(`${item.sourceType}:${item.sourceID}`);
      if (media == null) {
        throw new Error('resolveMedia() should have errored');
      }
      const { start, end } = getStartEnd(item, media);
      return {
        id: /** @type {PlaylistItemID} */ (randomUUID()),
        playlistID: playlist.id,
        mediaID: media.id,
        artist: item.artist ?? media.artist,
        title: item.title ?? media.title,
        start,
        end,
      };
    });

    const result = await this.#uw.db.transaction().execute(async (tx) => {
      const added = await tx.insertInto('playlistItems')
        .returningAll()
        .values(playlistItems)
        .execute();

      const { items: oldItems } = await tx.selectFrom('playlists')
        .select('items')
        .where('id', '=', playlist.id)
        .executeTakeFirstOrThrow();
      const insertIndex = after === null ? -1 : oldItems.indexOf(after);
      const newItems = [
        ...oldItems.slice(0, insertIndex + 1),
        ...playlistItems.map((item) => item.id),
        ...oldItems.slice(insertIndex + 1),
      ];

      await tx.updateTable('playlists')
        .where('id', '=', playlist.id)
        .set({ items: jsonb(newItems) })
        .executeTakeFirstOrThrow();

      return {
        added: added,
        afterID: after,
        playlistSize: newItems.length,
      };
    });

    return result;
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

    await db.transaction().execute(async (tx) => {
      const result = await tx.selectFrom('playlists')
        .select('items')
        .where('id', '=', playlist.id)
        .executeTakeFirst();

      const itemIDsInPlaylist = new Set(result?.items ?? []);
      const itemIDsToMove = new Set(itemIDs.filter((itemID) => itemIDsInPlaylist.has(itemID)));

      /** @type {PlaylistItemID[]} */
      let newItemIDs = [];
      let insertIndex = 0;
      let index = 0;
      for (const itemID of itemIDsInPlaylist) {
        index += 1;
        if (!itemIDsToMove.has(itemID)) {
          newItemIDs.push(itemID);
        }
        if (itemID === afterID) {
          insertIndex = index;
        }
      }

      newItemIDs = [
        ...newItemIDs.slice(0, insertIndex),
        ...itemIDsToMove,
        ...newItemIDs.slice(insertIndex),
      ];

      await tx.updateTable('playlists')
        .where('id', '=', playlist.id)
        .set('items', newItemIDs)
        .execute();
    });

    return {};
  }

  /**
   * @param {Playlist} playlist
   * @param {PlaylistItemID[]} itemIDs
   */
  async removePlaylistItems(playlist, itemIDs) {
    // Only remove items that are actually in this playlist.
    const set = new Set(itemIDs);
    /** @type {PlaylistItemID[]} */
    const toRemove = [];
    /** @type {PlaylistItemID[]} */
    const toKeep = [];
    playlist.items.forEach((itemID) => {
      if (set.has(itemID)) {
        toRemove.push(itemID);
      } else {
        toKeep.push(itemID);
      }
    });

    playlist.items = toKeep;
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
