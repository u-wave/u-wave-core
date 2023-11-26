import lodash from 'lodash';
import {
  PlaylistNotFoundError,
  PlaylistItemNotFoundError,
  ItemNotInPlaylistError,
  MediaNotFoundError,
  UserNotFoundError,
} from '../errors/index.js';
import Page from '../Page.js';
import routes from '../routes/playlists.js';
import { randomUUID } from 'node:crypto';

const { groupBy, shuffle } = lodash;

/**
 * @typedef {import('mongoose').PipelineStage} PipelineStage
 * @typedef {import('mongoose').PipelineStage.Facet['$facet'][string]} FacetPipelineStage
 * @typedef {import('mongodb').ObjectId} ObjectId
 * @typedef {Awaited<ReturnType< import('./users.js').UsersRepository['getUser'] >> & {}} User
 * @typedef {import('../models/index.js').Playlist} Playlist
 * @typedef {import('../models/Playlist.js').LeanPlaylist} LeanPlaylist
 * @typedef {import('../models/index.js').PlaylistItem} PlaylistItem
 * @typedef {import('../models/index.js').Media} Media
 * @typedef {{ media: Media }} PopulateMedia
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
    media,
    artist: artist ?? media.artist,
    title: title ?? media.title,
    start,
    end,
  };
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
   * @param {string} id
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
        'name',
        db.fn.countAll().as('size'),
        'playlists.createdAt',
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
    const id = randomUUID();

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
   * @param {object} patch
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
   * @returns {Promise<Playlist>}
   */
  // eslint-disable-next-line class-methods-use-this
  async shufflePlaylist(playlist) {
    playlist.media = shuffle(playlist.media);
    await playlist.save();
    return playlist;
  }

  /**
   * @param {Playlist} playlist
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line class-methods-use-this
  async deletePlaylist(playlist) {
    await playlist.deleteOne();
  }

  /**
   * @param {Playlist} playlist
   * @param {ObjectId} itemID
   * @returns {Promise<PlaylistItem & PopulateMedia>}
   */
  async getPlaylistItem(playlist, itemID) {
    const { PlaylistItem } = this.#uw.models;

    const playlistItemID = playlist.media.find((id) => id.equals(itemID));

    if (!playlistItemID) {
      throw new ItemNotInPlaylistError({ playlistID: playlist._id, itemID });
    }

    const item = await PlaylistItem.findById(playlistItemID);
    if (!item) {
      throw new PlaylistItemNotFoundError({ id: playlistItemID });
    }

    if (!item.populated('media')) {
      await item.populate('media');
    }

    // @ts-expect-error TS2322: The types of `media` are incompatible, but we just populated it,
    // typescript just doesn't know about that.
    return item;
  }

  /**
   * @param {{ id: string }} playlist
   * @param {string|undefined} filter
   * @param {{ offset: number, limit: number }} pagination
   */
  async getPlaylistItems(playlist, filter, pagination) {
    const { db } = this.#uw;

    let query = db.selectFrom('playlistItems')
      .where('playlistID', '=', playlist.id)
      .innerJoin('media', 'playlistItems.mediaID', 'media.id')
      .select([
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
      ]);
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

    const [
      playlistItemsRaw,
      filtered,
      total,
    ] = await Promise.all([
      query.execute(),
      filteredQuery.executeTakeFirstOrThrow(),
      totalQuery.executeTakeFirstOrThrow(),
    ]);

    const playlistItems = playlistItemsRaw.map((raw) => {
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
    })

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
   * @prop {string} [author]
   * @prop {string[]} [fields]
   *
   * @param {string} mediaID
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
   * @param {string[]} mediaIDs
   * @param {{ author?: string }} options
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
    const { Media, PlaylistItem } = this.#uw.models;

    if (!items.every(isValidPlaylistItem)) {
      throw new Error('Cannot add a playlist item without a proper media source type and ID.');
    }

    // Group by source so we can retrieve all unknown medias from the source in
    // one call.
    const itemsBySourceType = groupBy(items, 'sourceType');
    /**
     * @type {{ media: Media, artist: string, title: string, start: number, end: number }[]}
     */
    const playlistItems = [];
    const promises = Object.entries(itemsBySourceType).map(async ([sourceType, sourceItems]) => {
      /** @type {Media[]} */
      const knownMedias = await Media.find({
        sourceType,
        sourceID: { $in: sourceItems.map((item) => String(item.sourceID)) },
      });

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
        allMedias = allMedias.concat(await Media.create(unknownMedias));
      }

      const itemsWithMedia = sourceItems.map((item) => {
        const media = allMedias.find((compare) => compare.sourceID === String(item.sourceID));
        if (!media) {
          throw new MediaNotFoundError({ sourceType: item.sourceType, sourceID: item.sourceID });
        }
        return toPlaylistItem(item, media);
      });
      playlistItems.push(...itemsWithMedia);
    });

    await Promise.all(promises);

    if (playlistItems.length === 0) {
      return [];
    }
    return PlaylistItem.create(playlistItems);
  }

  /**
   * Add items to a playlist.
   *
   * @param {Playlist} playlist
   * @param {PlaylistItemDesc[]} items
   * @param {{ after?: ObjectId|null }} options
   * @returns {Promise<{
   *   added: PlaylistItem[],
   *   afterID: ObjectId?,
   *   playlistSize: number,
   * }>}
   */
  async addPlaylistItems(playlist, items, { after = null } = {}) {
    const { users } = this.#uw;
    const user = await users.getUser(playlist.author);
    if (!user) {
      throw new UserNotFoundError({ id: playlist.author });
    }

    const newItems = await this.createPlaylistItems(user, items);
    const oldMedia = playlist.media;
    const insertIndex = after === null ? -1 : oldMedia.findIndex((item) => item.equals(after));
    playlist.media = [
      ...oldMedia.slice(0, insertIndex + 1),
      ...newItems.map((item) => item._id),
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
   * @param {ObjectId[]} itemIDs
   * @param {{ afterID: ObjectId? }} options
   */
  // eslint-disable-next-line class-methods-use-this
  async movePlaylistItems(playlist, itemIDs, { afterID }) {
    // Use a plain array instead of a mongoose array because we need `splice()`.
    const itemsInPlaylist = [...playlist.media];
    const itemIDsInPlaylist = new Set(itemsInPlaylist.map((item) => `${item}`));
    // Only attempt to move items that are actually in the playlist.
    const itemIDsToInsert = itemIDs.filter((id) => itemIDsInPlaylist.has(`${id}`));

    // Remove the items that we are about to move.
    const newMedia = itemsInPlaylist.filter((item) => (
      itemIDsToInsert.every((insert) => !insert.equals(item))
    ));
    // Reinsert items at their new position.
    const insertIndex = afterID
      ? newMedia.findIndex((item) => item.equals(afterID))
      : -1;
    newMedia.splice(insertIndex + 1, 0, ...itemIDsToInsert);
    playlist.media = newMedia;

    await playlist.save();

    return {};
  }

  /**
   * @param {Playlist} playlist
   * @param {ObjectId[]} itemIDs
   */
  async removePlaylistItems(playlist, itemIDs) {
    const { PlaylistItem } = this.#uw.models;

    // Only remove items that are actually in this playlist.
    const stringIDs = new Set(itemIDs.map((item) => String(item)));
    /** @type {ObjectId[]} */
    const toRemove = [];
    /** @type {ObjectId[]} */
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
