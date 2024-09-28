import mongoose from 'mongoose';
import { getBoothData } from './booth.js';
import { serializePlaylist, serializeUser } from '../utils/serialize.js';

const { ObjectId } = mongoose.mongo;

/**
 * @param {import('../Uwave.js').default} uw
 * @param {Promise<import('../models/index.js').Playlist | null>} activePlaylist
 */
async function getFirstItem(uw, activePlaylist) {
  try {
    const playlist = await activePlaylist;
    if (playlist && playlist.size > 0) {
      const item = await uw.playlists.getPlaylistItem(playlist, playlist.media[0]);
      return item;
    }
  } catch (e) {
    // Nothing
  }
  return null;
}

/**
 * @param {unknown} str
 */
function toInt(str) {
  if (typeof str !== 'string') return 0;
  if (!/^\d+$/.test(str)) return 0;
  return parseInt(str, 10);
}

/**
 * @param {import('../Uwave.js').default} uw
 */
async function getOnlineUsers(uw) {
  const { User } = uw.models;

  const userIDs = await uw.redis.lrange('users', 0, -1);
  /** @type {Omit<import('../models/User.js').LeanUser, 'activePlaylist' | 'exiled' | 'level'>[]} */
  const users = await User.find({
    _id: {
      $in: userIDs.map((id) => new ObjectId(id)),
    },
  }).select({
    activePlaylist: 0,
    exiled: 0,
    level: 0,
    __v: 0,
  }).lean();

  return users.map(serializeUser);
}

/**
 * @param {import('../Uwave.js').default} uw
 */
async function getGuestsCount(uw) {
  const guests = await uw.redis.get('http-api:guests');
  return toInt(guests);
}

/**
 * @type {import('../types.js').Controller}
 */
async function getState(req) {
  const uw = req.uwave;
  const { authRegistry } = req.uwaveHttp;
  const { passport } = uw;
  const { user } = req;

  const motd = uw.motd.get();
  const users = getOnlineUsers(uw);
  const guests = getGuestsCount(uw);
  const roles = uw.acl.getAllRoles();
  const booth = getBoothData(uw);
  const waitlist = uw.waitlist.getUserIDs();
  const waitlistLocked = uw.waitlist.isLocked();
  const autoLeave = user != null ? uw.booth.getRemoveAfterCurrentPlay(user) : false;
  let activePlaylist = user?.activePlaylist
    ? uw.playlists.getUserPlaylist(user, user.activePlaylist)
    : null;
  const playlists = user ? uw.playlists.getUserPlaylists(user) : null;
  const firstActivePlaylistItem = activePlaylist ? getFirstItem(uw, activePlaylist) : null;
  const socketToken = user ? authRegistry.createAuthToken(user) : null;
  const authStrategies = passport.strategies();
  const time = Date.now();

  if (activePlaylist != null) {
    activePlaylist = activePlaylist
      .then((playlist) => playlist?.id)
      .catch((error) => {
        // If the playlist was not found, our database is inconsistent. A deleted or nonexistent
        // playlist should never be listed as the active playlist. Most likely this is not the
        // user's fault, so we should not error out on `/api/now`. Instead, pretend they don't have
        // an active playlist at all. Clients can then let them select a new playlist to activate.
        if (error.code === 'NOT_FOUND' || error.code === 'playlist-not-found') {
          req.log.warn('The active playlist does not exist', { error });
          return null;
        }
        throw error;
      });
  }

  const stateShape = {
    motd,
    user: user ? serializeUser(user) : null,
    users,
    guests,
    roles,
    booth,
    waitlist,
    waitlistLocked,
    autoLeave,
    activePlaylist,
    firstActivePlaylistItem,
    playlists,
    socketToken,
    authStrategies,
    time,
  };

  const stateKeys = Object.keys(stateShape);
  // This is a little dirty but maintaining the exact type shape is very hard here.
  // We could solve that in the future by using a `p-props` style function. The npm
  // module `p-props` is a bit wasteful though.
  /** @type {any} */
  const values = Object.values(stateShape);
  const stateValues = await Promise.all(values);

  const state = Object.create(null);
  for (let i = 0; i < stateKeys.length; i += 1) {
    state[stateKeys[i]] = stateValues[i];
  }

  if (state.playlists) {
    state.playlists = state.playlists.map(serializePlaylist);
  }

  return state;
}

export { getState };
