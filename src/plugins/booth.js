import assert from 'node:assert';
import RedLock from 'redlock';
import lodash from 'lodash';
import { EmptyPlaylistError, PlaylistItemNotFoundError } from '../errors/index.js';
import routes from '../routes/booth.js';

const { omit } = lodash;

/**
 * @typedef {import('type-fest').JsonObject} JsonObject
 * @typedef {import('../models/index.js').User} User
 * @typedef {import('../models/index.js').Playlist} Playlist
 * @typedef {import('../models/index.js').PlaylistItem} PlaylistItem
 * @typedef {import('../models/index.js').HistoryEntry} HistoryEntry
 * @typedef {import('../models/History.js').HistoryMedia} HistoryMedia
 * @typedef {import('../models/index.js').Media} Media
 * @typedef {{ user: User }} PopulateUser
 * @typedef {{ playlist: Playlist }} PopulatePlaylist
 * @typedef {{ media: Omit<HistoryMedia, 'media'> & { media: Media } }} PopulateMedia
 * @typedef {Omit<HistoryEntry, 'user' | 'playlist' | 'media'>
 *     & PopulateUser & PopulatePlaylist & PopulateMedia} PopulatedHistoryEntry
 */

const REDIS_ADVANCING = 'booth:advancing';
const REDIS_HISTORY_ID = 'booth:historyID';
const REDIS_CURRENT_DJ_ID = 'booth:currentDJ';
const REDIS_REMOVE_AFTER_CURRENT_PLAY = 'booth:removeAfterCurrentPlay';
const REDIS_UPVOTES = 'booth:upvotes';
const REDIS_DOWNVOTES = 'booth:downvotes';
const REDIS_FAVORITES = 'booth:favorites';

const REMOVE_AFTER_CURRENT_PLAY_SCRIPT = {
  keys: [REDIS_CURRENT_DJ_ID, REDIS_REMOVE_AFTER_CURRENT_PLAY],
  lua: `
    local k_dj = KEYS[1]
    local k_remove = KEYS[2]
    local user_id = ARGV[1]
    local value = ARGV[2]
    local current_dj_id = redis.call('GET', k_dj)
    if current_dj_id == user_id then
      if value == 'true' then
        redis.call('SET', k_remove, 'true')
        return 1
      else
        redis.call('DEL', k_remove)
        return 0
      end
    else
      return redis.error_reply('You are not currently playing')
    end
  `,
};

/**
 * @param {Playlist} playlist
 * @returns {Promise<void>}
 */
async function cyclePlaylist(playlist) {
  const item = playlist.media.shift();
  if (item !== undefined) {
    playlist.media.push(item);
  }
  await playlist.save();
}

class Booth {
  #uw;

  #logger;

  /** @type {ReturnType<typeof setTimeout>|null} */
  #timeout = null;

  #locker;

  /** @type {Promise<unknown>|null} */
  #awaitAdvance = null;

  /**
   * @param {import('../Uwave.js').Boot} uw
   */
  constructor(uw) {
    this.#uw = uw;
    this.#locker = new RedLock([this.#uw.redis]);
    this.#logger = uw.logger.child({ ns: 'uwave:booth' });

    uw.redis.defineCommand('uw:removeAfterCurrentPlay', {
      numberOfKeys: REMOVE_AFTER_CURRENT_PLAY_SCRIPT.keys.length,
      lua: REMOVE_AFTER_CURRENT_PLAY_SCRIPT.lua,
    });
  }

  /** @internal */
  async onStart() {
    const current = await this.getCurrentEntry();
    if (current && this.#timeout === null) {
      // Restart the advance timer after a server restart, if a track was
      // playing before the server restarted.
      const duration = (current.media.end - current.media.start) * 1000;
      const endTime = Number(current.playedAt) + duration;
      if (endTime > Date.now()) {
        this.#timeout = setTimeout(
          () => this.#advanceAutomatically(),
          endTime - Date.now(),
        );
      } else {
        this.#advanceAutomatically();
      }
    }

    this.#uw.onClose(async () => {
      this.#onStop();
      await this.#awaitAdvance;
    });
  }

  async #advanceAutomatically() {
    try {
      await this.advance();
    } catch (error) {
      this.#logger.error({ err: error }, 'advance failed');
    }
  }

  #onStop() {
    this.#maybeStop();
  }

  /**
   * @returns {Promise<HistoryEntry | null>}
   */
  async getCurrentEntry() {
    const { HistoryEntry } = this.#uw.models;
    const historyID = await this.#uw.redis.get(REDIS_HISTORY_ID);
    if (!historyID) {
      return null;
    }

    return HistoryEntry.findById(historyID, '+media.sourceData');
  }

  /**
   * Get vote counts for the currently playing media.
   *
   * @returns {Promise<{ upvotes: string[], downvotes: string[], favorites: string[] }>}
   */
  async getCurrentVoteStats() {
    const { redis } = this.#uw;

    const results = await redis.pipeline()
      .smembers(REDIS_UPVOTES)
      .smembers(REDIS_DOWNVOTES)
      .smembers(REDIS_FAVORITES)
      .exec();
    assert(results);

    const voteStats = {
      upvotes: /** @type {string[]} */ (results[0][1]),
      downvotes: /** @type {string[]} */ (results[1][1]),
      favorites: /** @type {string[]} */ (results[2][1]),
    };

    return voteStats;
  }

  /**
   * @param {HistoryEntry} entry
   */
  async #saveStats(entry) {
    const stats = await this.getCurrentVoteStats();

    Object.assign(entry, stats);
    return entry.save();
  }

  /**
   * @param {{ remove?: boolean }} options
   * @returns {Promise<User|null>}
   */
  async #getNextDJ(options) {
    const { User } = this.#uw.models;
    /** @type {string|null} */
    let userID = await this.#uw.redis.lindex('waitlist', 0);
    if (!userID && !options.remove) {
      // If the waitlist is empty, the current DJ will play again immediately.
      userID = await this.#uw.redis.get(REDIS_CURRENT_DJ_ID);
    }
    if (!userID) {
      return null;
    }

    return User.findById(userID);
  }

  /**
   * @param {{ remove?: boolean }} options
   * @returns {Promise<PopulatedHistoryEntry | null>}
   */
  async #getNextEntry(options) {
    const { HistoryEntry, PlaylistItem } = this.#uw.models;
    const { playlists } = this.#uw;

    const user = await this.#getNextDJ(options);
    if (!user || !user.activePlaylist) {
      return null;
    }
    const playlist = await playlists.getUserPlaylist(user, user.activePlaylist);
    if (playlist.size === 0) {
      throw new EmptyPlaylistError();
    }

    const playlistItem = await PlaylistItem.findById(playlist.media[0]);
    if (!playlistItem) {
      throw new PlaylistItemNotFoundError({ id: playlist.media[0] });
    }

    /** @type {PopulatedHistoryEntry} */
    // @ts-expect-error TS2322: `user` and `playlist` are already populated,
    // and `media.media` is populated immediately below.
    const entry = new HistoryEntry({
      user,
      playlist,
      item: playlistItem._id,
      media: {
        media: playlistItem.media,
        artist: playlistItem.artist,
        title: playlistItem.title,
        start: playlistItem.start,
        end: playlistItem.end,
      },
    });
    await entry.populate('media.media');

    return entry;
  }

  /**
   * @param {HistoryEntry|null} previous
   * @param {{ remove?: boolean }} options
   */
  async #cycleWaitlist(previous, options) {
    const waitlistLen = await this.#uw.redis.llen('waitlist');
    if (waitlistLen > 0) {
      await this.#uw.redis.lpop('waitlist');
      if (previous && !options.remove) {
        // The previous DJ should only be added to the waitlist again if it was
        // not empty. If it was empty, the previous DJ is already in the booth.
        await this.#uw.redis.rpush('waitlist', previous.user.toString());
      }
    }
  }

  async clear() {
    await this.#uw.redis.del(
      REDIS_HISTORY_ID,
      REDIS_CURRENT_DJ_ID,
      REDIS_REMOVE_AFTER_CURRENT_PLAY,
      REDIS_UPVOTES,
      REDIS_DOWNVOTES,
      REDIS_FAVORITES,
    );
  }

  /**
   * @param {PopulatedHistoryEntry} next
   */
  async #update(next) {
    await this.#uw.redis.multi()
      .del(REDIS_UPVOTES, REDIS_DOWNVOTES, REDIS_FAVORITES, REDIS_REMOVE_AFTER_CURRENT_PLAY)
      .set(REDIS_HISTORY_ID, next.id)
      .set(REDIS_CURRENT_DJ_ID, next.user.id)
      .exec();
  }

  #maybeStop() {
    if (this.#timeout) {
      clearTimeout(this.#timeout);
      this.#timeout = null;
    }
  }

  /**
   * @param {PopulatedHistoryEntry} entry
   */
  #play(entry) {
    this.#maybeStop();
    this.#timeout = setTimeout(
      () => this.#advanceAutomatically(),
      (entry.media.end - entry.media.start) * 1000,
    );
  }

  /**
   * This method creates a `media` object that clients can understand from a
   * history entry object.
   *
   * We present the playback-specific `sourceData` as if it is
   * a property of the media model for backwards compatibility.
   * Old clients don't expect `sourceData` directly on a history entry object.
   *
   * @param {PopulateMedia} historyEntry
   */
  // eslint-disable-next-line class-methods-use-this
  getMediaForPlayback(historyEntry) {
    return Object.assign(omit(historyEntry.media, 'sourceData'), {
      media: {
        ...historyEntry.media.media.toJSON(),
        sourceData: {
          ...historyEntry.media.media.sourceData,
          ...historyEntry.media.sourceData,
        },
      },
    });
  }

  /**
   * @param {PopulatedHistoryEntry|null} next
   */
  async #publishAdvanceComplete(next) {
    const { waitlist } = this.#uw;

    if (next) {
      this.#uw.publish('advance:complete', {
        historyID: next.id,
        userID: next.user.id,
        playlistID: next.playlist.id,
        itemID: next.item.toString(),
        media: this.getMediaForPlayback(next),
        playedAt: next.playedAt.getTime(),
      });
      this.#uw.publish('playlist:cycle', {
        userID: next.user.id,
        playlistID: next.playlist.id,
      });
    } else {
      this.#uw.publish('advance:complete', null);
    }
    this.#uw.publish('waitlist:update', await waitlist.getUserIDs());
  }

  /**
   * @param {PopulatedHistoryEntry} entry
   */
  async #getSourceDataForPlayback(entry) {
    const { sourceID, sourceType } = entry.media.media;
    const source = this.#uw.source(sourceType);
    if (source) {
      this.#logger.trace({ sourceType: source.type, sourceID }, 'running pre-play hook');
      /** @type {JsonObject | undefined} */
      let sourceData;
      try {
        sourceData = await source.play(entry.user, entry.media.media);
        this.#logger.trace({ sourceType: source.type, sourceID, sourceData }, 'pre-play hook result');
      } catch (error) {
        this.#logger.error({ sourceType: source.type, sourceID, err: error }, 'pre-play hook failed');
      }
      return sourceData;
    }

    return undefined;
  }

  /**
   * @typedef {object} AdvanceOptions
   * @prop {boolean} [remove]
   * @prop {boolean} [publish]
   * @prop {import('redlock').RedlockAbortSignal} [signal]
   *
   * @param {AdvanceOptions} [opts]
   * @returns {Promise<PopulatedHistoryEntry|null>}
   */
  async #advanceLocked(opts = {}) {
    const publish = opts.publish ?? true;
    const removeAfterCurrent = (await this.#uw.redis.del(REDIS_REMOVE_AFTER_CURRENT_PLAY)) === 1;
    const remove = opts.remove || removeAfterCurrent || (
      !await this.#uw.waitlist.isCycleEnabled()
    );

    const previous = await this.getCurrentEntry();
    let next;
    try {
      next = await this.#getNextEntry({ remove });
    } catch (err) {
      // If the next user's playlist was empty, remove them from the waitlist
      // and try advancing again.
      if (err instanceof EmptyPlaylistError) {
        this.#logger.info('user has empty playlist, skipping on to the next');
        await this.#cycleWaitlist(previous, { remove });
        return this.#advanceLocked({ publish, remove: true });
      }
      throw err;
    }

    if (opts.signal?.aborted) {
      throw opts.signal.error;
    }

    if (previous) {
      await this.#saveStats(previous);

      this.#logger.info({
        id: previous._id,
        artist: previous.media.artist,
        title: previous.media.title,
        upvotes: previous.upvotes.length,
        favorites: previous.favorites.length,
        downvotes: previous.downvotes.length,
      }, 'previous track stats');
    }

    if (next) {
      this.#logger.info({
        id: next._id,
        artist: next.media.artist,
        title: next.media.title,
      }, 'next track');
      const sourceData = await this.#getSourceDataForPlayback(next);
      if (sourceData) {
        next.media.sourceData = sourceData;
      }
      await next.save();
    } else {
      this.#maybeStop();
    }

    await this.#cycleWaitlist(previous, { remove });

    if (next) {
      await this.#update(next);
      await cyclePlaylist(next.playlist);
      this.#play(next);
    } else {
      await this.clear();
    }

    if (publish !== false) {
      await this.#publishAdvanceComplete(next);
    }

    return next;
  }

  /**
   * @param {AdvanceOptions} [opts]
   * @returns {Promise<PopulatedHistoryEntry|null>}
   */
  advance(opts = {}) {
    const result = this.#locker.using(
      [REDIS_ADVANCING],
      10_000,
      (signal) => this.#advanceLocked({ ...opts, signal }),
    );
    this.#awaitAdvance = result;
    return result;
  }

  /**
   * @param {User} user
   * @param {boolean} remove
   */
  async setRemoveAfterCurrentPlay(user, remove) {
    const newValue = await this.#uw.redis['uw:removeAfterCurrentPlay'](
      ...REMOVE_AFTER_CURRENT_PLAY_SCRIPT.keys,
      user._id.toString(),
      remove,
    );
    return newValue === 1;
  }

  /**
   * @param {User} user
   */
  async getRemoveAfterCurrentPlay(user) {
    const [currentDJ, removeAfterCurrentPlay] = await this.#uw.redis.mget(
      REDIS_CURRENT_DJ_ID,
      REDIS_REMOVE_AFTER_CURRENT_PLAY,
    );
    if (currentDJ === user.id) {
      return removeAfterCurrentPlay != null;
    }
    return null;
  }
}

/**
 * @param {import('../Uwave.js').Boot} uw
 */
async function boothPlugin(uw) {
  uw.booth = new Booth(uw);
  uw.httpApi.use('/booth', routes());

  uw.after(async (err) => {
    if (!err) {
      await uw.booth.onStart();
    }
  });
}

export default boothPlugin;
export { Booth };
