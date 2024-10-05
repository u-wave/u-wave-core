import assert from 'node:assert';
import {
  HTTPError,
  PermissionError,
  HistoryEntryNotFoundError,
  PlaylistNotFoundError,
  CannotSelfFavoriteError,
  UserNotFoundError,
} from '../errors/index.js';
import getOffsetPagination from '../utils/getOffsetPagination.js';
import toItemResponse from '../utils/toItemResponse.js';
import toListResponse from '../utils/toListResponse.js';
import toPaginatedResponse from '../utils/toPaginatedResponse.js';
import { Permissions } from '../plugins/acl.js';

/**
 * @typedef {import('../schema').UserID} UserID
 * @typedef {import('../schema').MediaID} MediaID
 * @typedef {import('../schema').PlaylistID} PlaylistID
 * @typedef {import('../schema').HistoryEntryID} HistoryEntryID
 */

const REDIS_HISTORY_ID = 'booth:historyID';
const REDIS_CURRENT_DJ_ID = 'booth:currentDJ';

/**
 * @param {import('../Uwave.js').default} uw
 */
async function getBoothData(uw) {
  const { booth } = uw;

  const state = await booth.getCurrentEntry();
  if (state == null) {
    return null;
  }

  // @ts-expect-error TS2322: We just populated historyEntry.media.media
  const media = booth.getMediaForPlayback(state);

  return {
    historyID: state.historyEntry.id,
    // playlistID: state.playlist.id,
    playedAt: state.historyEntry.createdAt.getTime(),
    userID: state.user.id,
    media,
    stats: {
      upvotes: state.upvotes,
      downvotes: state.downvotes,
      favorites: state.favorites,
    },
  };
}

/**
 * @type {import('../types.js').Controller}
 */
async function getBooth(req) {
  const uw = req.uwave;

  const data = await getBoothData(uw);
  if (data && req.user && data.userID === req.user.id) {
    return toItemResponse({
      ...data,
      autoLeave: await uw.booth.getRemoveAfterCurrentPlay(req.user),
    }, { url: req.fullUrl });
  }

  return toItemResponse(data, { url: req.fullUrl });
}

/**
 * @param {import('../Uwave.js').default} uw
 */
function getCurrentDJ(uw) {
  return /** @type {Promise<UserID|null>} */ (uw.redis.get(REDIS_CURRENT_DJ_ID));
}

/**
 * @param {import('../Uwave.js').default} uw
 */
function getCurrentHistoryID(uw) {
  return /** @type {Promise<HistoryEntryID|null>} */ (uw.redis.get(REDIS_HISTORY_ID));
}

/**
 * @param {import('../Uwave.js').default} uw
 * @param {UserID|null} moderatorID - `null` if a user is skipping their own turn.
 * @param {UserID} userID
 * @param {string|null} reason
 * @param {{ remove?: boolean }} [opts]
 */
async function doSkip(uw, moderatorID, userID, reason, opts = {}) {
  uw.publish('booth:skip', {
    moderatorID,
    userID,
    reason,
  });

  await uw.booth.advance({
    remove: opts.remove === true,
  });
}

/**
 * @typedef {object} SkipUserAndReason
 * @prop {UserID} userID
 * @prop {string} reason
 * @typedef {{
 *   remove?: boolean,
 *   userID?: UserID,
 *   reason?: string,
 * } & (SkipUserAndReason | {})} SkipBoothBody
 */

/**
 * @type {import('../types.js').AuthenticatedController<{}, {}, SkipBoothBody>}
 */
async function skipBooth(req) {
  const { user } = req;
  const { userID, reason, remove } = req.body;
  const { acl } = req.uwave;

  const skippingSelf = (!userID && !reason) || userID === user.id;
  const opts = { remove: !!remove };

  if (skippingSelf) {
    const currentDJ = await getCurrentDJ(req.uwave);
    if (!currentDJ || currentDJ !== req.user.id) {
      throw new HTTPError(412, 'You are not currently playing');
    }

    await doSkip(req.uwave, null, req.user.id, null, opts);

    return toItemResponse({});
  }

  if (!await acl.isAllowed(user, Permissions.SkipOther)) {
    throw new PermissionError({ requiredRole: Permissions.SkipOther });
  }

  // @ts-expect-error TS2345 pretending like `userID` is definitely defined here
  // TODO I think the typescript error is actually correct so we should fix this
  await doSkip(req.uwave, user.id, userID, reason, opts);

  return toItemResponse({});
}

/** @typedef {{ userID: UserID, autoLeave: boolean }} LeaveBoothBody */

/**
 * @type {import('../types.js').AuthenticatedController<{}, {}, LeaveBoothBody>}
 */
async function leaveBooth(req) {
  const { user: self } = req;
  const { userID, autoLeave } = req.body;
  const { acl, booth, users } = req.uwave;

  const skippingSelf = userID === self.id;

  if (skippingSelf) {
    const value = await booth.setRemoveAfterCurrentPlay(self, autoLeave);
    return toItemResponse({ autoLeave: value });
  }

  if (!await acl.isAllowed(self, Permissions.SkipOther)) {
    throw new PermissionError({ requiredRole: Permissions.SkipOther });
  }

  const user = await users.getUser(userID);
  if (!user) {
    throw new UserNotFoundError({ id: userID });
  }

  const value = await booth.setRemoveAfterCurrentPlay(user, autoLeave);
  return toItemResponse({ autoLeave: value });
}

/**
 * @typedef {object} ReplaceBoothBody
 * @prop {UserID} userID
 */

/**
 * @type {import('../types.js').AuthenticatedController<{}, {}, ReplaceBoothBody>}
 */
async function replaceBooth(req) {
  const uw = req.uwave;
  const moderatorID = req.user.id;
  const { userID } = req.body;
  let waitlist = await uw.redis.lrange('waitlist', 0, -1);

  if (!waitlist.length) {
    throw new HTTPError(404, 'Waitlist is empty.');
  }

  if (waitlist.includes(userID)) {
    uw.redis.lrem('waitlist', 1, userID);
    await uw.redis.lpush('waitlist', userID);
    waitlist = await uw.redis.lrange('waitlist', 0, -1);
  }

  uw.publish('booth:replace', {
    moderatorID,
    userID,
  });

  await uw.booth.advance();

  return toItemResponse({});
}

/**
 * @param {import('../Uwave.js').default} uw
 * @param {HistoryEntryID} historyEntryID
 * @param {UserID} userID
 * @param {1|-1} direction
 */
async function addVote(uw, historyEntryID, userID, direction) {
  await uw.db.insertInto('feedback')
    .values({
      historyEntryID,
      userID,
      vote: direction,
    })
    .onConflict((oc) => oc.columns(['historyEntryID', 'userID']).doUpdateSet({ vote: direction }))
    .execute();

  uw.publish('booth:vote', {
    userID, direction,
  });
}

/**
 * Old way of voting: over the WebSocket
 *
 * @param {import('../Uwave.js').default} uw
 * @param {UserID} userID
 * @param {1|-1} direction
 */
async function socketVote(uw, userID, direction) {
  const currentDJ = await getCurrentDJ(uw);
  if (currentDJ != null && currentDJ !== userID) {
    const historyEntryID = await getCurrentHistoryID(uw);
    if (historyEntryID == null) {
      return;
    }
    if (direction > 0) {
      await addVote(uw, historyEntryID, userID, 1);
    } else {
      await addVote(uw, historyEntryID, userID, -1);
    }
  }
}

/**
 * @typedef {object} GetVoteParams
 * @prop {HistoryEntryID} historyID
 */

/**
 * @type {import('../types.js').AuthenticatedController<GetVoteParams>}
 */
async function getVote(req) {
  const { uwave: uw, user } = req;
  const { historyID } = req.params;

  const currentHistoryID = await getCurrentHistoryID(uw);
  if (currentHistoryID == null) {
    throw new HTTPError(412, 'Nobody is playing');
  }
  if (historyID && historyID !== currentHistoryID) {
    throw new HTTPError(412, 'Cannot get vote for media that is not currently playing');
  }

  const feedback = await uw.db.selectFrom('feedback')
    .where('historyEntryID', '=', historyID)
    .where('userID', '=', user.id)
    .select('vote')
    .executeTakeFirst();

  const direction = feedback?.vote ?? 0;
  return toItemResponse({ direction });
}

/**
 * @typedef {object} VoteParams
 * @prop {HistoryEntryID} historyID
 * @typedef {object} VoteBody
 * @prop {1|-1} direction
 */

/**
 * @type {import('../types.js').AuthenticatedController<VoteParams, {}, VoteBody>}
 */
async function vote(req) {
  const { uwave: uw, user } = req;
  const { historyID } = req.params;
  const { direction } = req.body;

  const [currentDJ, currentHistoryID] = await Promise.all([
    getCurrentDJ(uw),
    getCurrentHistoryID(uw),
  ]);
  if (currentDJ == null || currentHistoryID == null) {
    throw new HTTPError(412, 'Nobody is playing');
  }
  if (currentDJ === user.id) {
    throw new HTTPError(412, 'Cannot vote for your own plays');
  }
  if (historyID && historyID !== currentHistoryID) {
    throw new HTTPError(412, 'Cannot vote for media that is not currently playing');
  }

  if (direction > 0) {
    await addVote(uw, historyID, user.id, 1);
  } else {
    await addVote(uw, historyID, user.id, -1);
  }

  return toItemResponse({});
}

/**
 * @typedef {object} FavoriteBody
 * @prop {PlaylistID} playlistID
 * @prop {HistoryEntryID} historyID
 */

/**
 * @type {import('../types.js').AuthenticatedController<{}, {}, FavoriteBody>}
 */
async function favorite(req) {
  const { user } = req;
  const { playlistID, historyID } = req.body;
  const { db, history, playlists } = req.uwave;
  const uw = req.uwave;

  const historyEntry = await history.getEntry(historyID);

  if (!historyEntry) {
    throw new HistoryEntryNotFoundError({ id: historyID });
  }
  if (historyEntry.user._id === user.id) {
    throw new CannotSelfFavoriteError();
  }

  const playlist = await playlists.getUserPlaylist(user, playlistID);
  if (!playlist) {
    throw new PlaylistNotFoundError({ id: playlistID });
  }

  const result = await playlists.addPlaylistItems(
    playlist,
    [{
      sourceType: historyEntry.media.media.sourceType,
      sourceID: historyEntry.media.media.sourceID,
      artist: historyEntry.media.artist,
      title: historyEntry.media.title,
      start: historyEntry.media.start,
      end: historyEntry.media.end,
    }],
    { at: 'end' },
  );

  await db.insertInto('feedback')
    .values({ userID: user.id, historyEntryID: historyID, favorite: 1 })
    .onConflict((oc) => oc.columns(['userID', 'historyEntryID']).doUpdateSet({ favorite: 1 }))
    .execute();

  uw.publish('booth:favorite', {
    userID: user.id,
    playlistID,
  });

  return toListResponse(result.added, {
    meta: {
      playlistSize: result.playlistSize,
    },
    included: {
      media: ['media'],
    },
  });
}

/**
 * @typedef {object} GetRoomHistoryQuery
 * @prop {import('../types.js').PaginationQuery & { media?: MediaID }} [filter]
 */
/**
 * @type {import('../types.js').Controller<never, GetRoomHistoryQuery, never>}
 */
async function getHistory(req) {
  const filter = {};
  const pagination = getOffsetPagination(req.query, {
    defaultSize: 25,
    maxSize: 100,
  });
  const { history } = req.uwave;

  if (req.query.filter && req.query.filter.media) {
    filter['media.media'] = req.query.filter.media;
  }

  // TODO: Support filter?

  const roomHistory = await history.getRoomHistory(pagination);

  return toPaginatedResponse(roomHistory, {
    baseUrl: req.fullUrl,
    included: {
      media: ['media.media'],
      user: ['user'],
    },
  });
}

export {
  favorite,
  getBooth,
  getBoothData,
  getHistory,
  getVote,
  leaveBooth,
  replaceBooth,
  skipBooth,
  socketVote,
  vote,
};
