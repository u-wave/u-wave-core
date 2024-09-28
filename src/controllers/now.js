import { getBoothData } from './booth.js';
import { serializePlaylist, serializeUser } from '../utils/serialize.js';
import { legacyPlaylistItem } from './playlists.js';

/**
 * @typedef {import('../schema.js').UserID} UserID
 */

/**
 * @param {import('../Uwave.js').default} uw
 * @param {import('../schema.js').Playlist & { size: number }} playlist
 */
async function getFirstItem(uw, playlist) {
  try {
    if (playlist.size > 0) {
      const { playlistItem, media } = await uw.playlists.getPlaylistItemAt(playlist, 0);
      return legacyPlaylistItem(playlistItem, media);
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
  const userIDs = /** @type {UserID[]} */ (await uw.redis.lrange('users', 0, -1));
  if (userIDs.length === 0) {
    return [];
  }

  const users = await uw.users.getUsersByIds(userIDs);
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
  let activePlaylist = user?.activePlaylistID
    ? uw.playlists.getUserPlaylist(user, user.activePlaylistID).catch((error) => {
      // If the playlist was not found, our database is inconsistent. A deleted or nonexistent
      // playlist should never be listed as the active playlist. Most likely this is not the
      // user's fault, so we should not error out on `/api/now`. Instead, pretend they don't have
      // an active playlist at all. Clients can then let them select a new playlist to activate.
      if (error.code === 'NOT_FOUND' || error.code === 'playlist-not-found') {
        req.log.warn('The active playlist does not exist', { error });
        return null;
      }
      throw error;
    })
    : Promise.resolve(null);
  const playlists = user ? uw.playlists.getUserPlaylists(user) : null;
  const firstActivePlaylistItem = activePlaylist.then((playlist) => playlist ? getFirstItem(uw, playlist) : null);
  const socketToken = user ? authRegistry.createAuthToken(user) : null;
  const authStrategies = passport.strategies();
  const time = Date.now();

  const stateShape = {
    motd,
    user: user ? serializeUser(user) : null,
    users,
    guests,
    roles,
    booth,
    waitlist,
    waitlistLocked,
    activePlaylist: activePlaylist.then((playlist) => playlist?.id ?? null),
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
