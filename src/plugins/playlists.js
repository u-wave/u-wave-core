import lodash from 'lodash';
import escapeStringRegExp from 'escape-string-regexp';
import {
  PlaylistNotFoundError,
  PlaylistItemNotFoundError,
  ItemNotInPlaylistError,
  MediaNotFoundError,
  UserNotFoundError,
} from '../errors/index.js';
import Page from '../Page.js';
import routes from '../routes/playlists.js';

const { groupBy, shuffle } = lodash;

/**
 * @typedef {import('mongoose').PipelineStage} PipelineStage
 * @typedef {import('mongoose').PipelineStage.Facet['$facet'][string]} FacetPipelineStage
 * @typedef {import('mongodb').ObjectId} ObjectId
 * @typedef {import('../models/index.js').User} User
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
   * @param {ObjectId} id
   * @return {Promise<Playlist>}
   */
  async getPlaylist(id) {
    const { Playlist } = this.#uw.models;
    if (id instanceof Playlist) {
      return id;
    }
    const playlist = await Playlist.findById(id);
    if (!playlist) {
      throw new PlaylistNotFoundError({ id });
    }
    return playlist;
  }

  /**
   * @param {ObjectId} id
   * @return {Promise<Media>}
   */
  async getMedia(id) {
    const { Media } = this.#uw.models;
    if (id instanceof Media) {
      return id;
    }
    const media = await Media.findById(id);
    if (!media) {
      throw new MediaNotFoundError({ id });
    }
    return media;
  }

  /**
   * @param {User} user
   * @param {ObjectId} id
   * @returns {Promise<Playlist>}
   */
  async getUserPlaylist(user, id) {
    const { Playlist } = this.#uw.models;
    const playlist = await Playlist.findOne({ _id: id, author: user._id });
    if (!playlist) {
      throw new PlaylistNotFoundError({ id });
    }
    return playlist;
  }

  /**
   * @param {User} user
   * @param {{ name: string }} options
   * @returns {Promise<Playlist>}
   */
  async createPlaylist(user, { name }) {
    const { Playlist } = this.#uw.models;

    const playlist = await Playlist.create({
      name,
      author: user._id,
    });

    // If this is the user's first playlist, immediately activate it.
    if (user.activePlaylist == null) {
      this.#logger.info({ userId: user.id, playlistId: playlist.id }, 'activating first playlist');
      user.activePlaylist = playlist._id;
      await user.save();
    }

    return playlist;
  }

  /**
   * @param {User} user
   * @returns {Promise<LeanPlaylist[]>}
   */
  async getUserPlaylists(user) {
    const { Playlist } = this.#uw.models;
    const userID = typeof user === 'object' ? user.id : user;
    const playlists = await Playlist.where('author', userID).lean();
    return playlists;
  }

  /**
   * @param {Playlist} playlist
   * @param {object} patch
   * @returns {Promise<Playlist>}
   */

  async updatePlaylist(playlist, patch = {}) {
    Object.assign(playlist, patch);
    await playlist.save();
    return playlist;
  }

  /**
   * @param {Playlist} playlist
   * @returns {Promise<Playlist>}
   */

  async shufflePlaylist(playlist) {
    playlist.media = shuffle(playlist.media);
    await playlist.save();
    return playlist;
  }

  /**
   * @param {Playlist} playlist
   * @returns {Promise<void>}
   */

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
   * @param {Playlist} playlist
   * @param {string|undefined} filter
   * @param {{ offset: number, limit: number }} pagination
   * @returns {Promise<Page<PlaylistItem, { offset: number, limit: number }>>}
   */
  async getPlaylistItems(playlist, filter, pagination) {
    const { Playlist } = this.#uw.models;

    /** @type {PipelineStage[]} */
    const aggregate = [
      // find the playlist
      { $match: { _id: playlist._id } },
      { $limit: 1 },
      // find the items
      { $project: { _id: 0, media: 1 } },
      { $unwind: '$media' },
      {
        $lookup: {
          from: 'playlistitems', localField: 'media', foreignField: '_id', as: 'item',
        },
      },
      // return only the items
      { $unwind: '$item' }, // just one each
      { $replaceRoot: { newRoot: '$item' } },
    ];

    if (filter) {
      const rx = new RegExp(escapeStringRegExp(filter), 'i');
      aggregate.push({
        $match: {
          $or: [{ artist: rx }, { title: rx }],
        },
      });
    }

    /** @type {FacetPipelineStage} */
    const aggregateCount = [
      { $count: 'filtered' },
    ];
    /** @type {FacetPipelineStage} */
    const aggregateItems = [
      { $skip: pagination.offset },
      { $limit: pagination.limit },
    ];

    // look up the media items after this is all filtered down
    aggregateItems.push(
      {
        $lookup: {
          from: 'media', localField: 'media', foreignField: '_id', as: 'media',
        },
      },
      { $unwind: '$media' }, // is always 1 item, is there a better way than $unwind?
    );

    aggregate.push({
      $facet: {
        count: aggregateCount,
        items: aggregateItems,
      },
    });

    const [{ count, items }] = await Playlist.aggregate(aggregate);

    // `items` is the same shape as a PlaylistItem instance!
    return new Page(items, {
      pageSize: pagination.limit,
      // `count` can be the empty array if the playlist has no items
      filtered: filter ? (count[0]?.filtered ?? 0) : playlist.media.length,
      total: playlist.media.length,

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
   * @prop {ObjectId} [author]
   * @prop {string[]} [fields]
   *
   * @param {ObjectId} mediaID
   * @param {GetPlaylistsContainingMediaOptions} options
   * @return {Promise<Playlist[]>}
   */
  async getPlaylistsContainingMedia(mediaID, options = {}) {
    const { Playlist } = this.#uw.models;

    const aggregate = [];
    if (options.author) {
      aggregate.push({ $match: { author: options.author } });
    }

    aggregate.push(
      // populate media array
      {
        $lookup: {
          from: 'playlistitems', localField: 'media', foreignField: '_id', as: 'media',
        },
      },
      // check if any media entry contains the id
      { $match: { 'media.media': mediaID } },
      // reduce data sent in `media` array—this is still needed to match the result of other
      // `getPlaylists()` functions
      { $addFields: { media: '$media.media' } },
    );

    if (options.fields) {
      /** @type {Record<string, 1>} */
      const fields = {};
      options.fields.forEach((fieldName) => {
        fields[fieldName] = 1;
      });
      aggregate.push({
        $project: fields,
      });
    }

    const playlists = await Playlist.aggregate(aggregate, { maxTimeMS: 5_000 });
    return playlists.map((raw) => Playlist.hydrate(raw));
  }

  /**
   * Get playlists that contain any of the given medias. If multiple medias are in a single
   * playlist, that playlist will be returned multiple times, keyed on the media's unique ObjectId.
   *
   * @param {ObjectId[]} mediaIDs
   * @param {{ author?: ObjectId }} options
   * @return {Promise<Map<string, Playlist[]>>}
   *   A map of stringified `Media` `ObjectId`s to the Playlist objects that contain them.
   */
  async getPlaylistsContainingAnyMedia(mediaIDs, options = {}) {
    const { Playlist } = this.#uw.models;

    const aggregate = [];

    if (options.author) {
      aggregate.push({ $match: { author: options.author } });
    }

    aggregate.push(
      // Store the `size` so we can remove the `.media` property later.
      { $addFields: { size: { $size: '$media' } } },
      // Store the playlist data on a property so lookup data does not pollute it.
      // The result data is easier to process as separate {playlist, media} properties.
      { $replaceRoot: { newRoot: { playlist: '$$ROOT' } } },
      // Find the playlist items in each playlist.
      {
        $lookup: {
          from: 'playlistitems',
          localField: 'playlist.media',
          foreignField: '_id',
          as: 'media',
        },
      },
      // Unwind so we can match on individual playlist items.
      { $unwind: '$media' },
      {
        $match: {
          'media.media': { $in: mediaIDs },
        },
      },
      // Omit the potentially large list of media IDs that we don't use.
      { $project: { 'playlist.media': 0 } },
    );

    const pairs = await Playlist.aggregate(aggregate);

    const playlistsByMediaID = new Map();
    pairs.forEach(({ playlist, media }) => {
      const stringID = media.media.toString();
      const playlists = playlistsByMediaID.get(stringID);
      if (playlists) {
        playlists.push(playlist);
      } else {
        playlistsByMediaID.set(stringID, [playlist]);
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
