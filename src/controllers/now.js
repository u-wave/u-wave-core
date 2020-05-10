const debug = require('debug')('uwave:http-api:now');
const { getBoothData } = require('./booth');
const { serializePlaylist } = require('../utils/serialize');

async function getFirstItem(user, activePlaylist) {
  try {
    const playlist = await activePlaylist;
    if (playlist) {
      const item = await playlist.getItemAt(0);
      return item;
    }
  } catch (e) {
    // Nothing
  }
  return null;
}

function toInt(str) {
  if (typeof str !== 'string') return 0;
  if (!/^\d+$/.test(str)) return 0;
  return parseInt(str, 10);
}

async function getOnlineUsers(uw) {
  const { User } = uw.models;

  const userIDs = await uw.redis.lrange('users', 0, -1);
  return User.find({ _id: { $in: userIDs } });
}

async function getGuestsCount(uw) {
  const guests = await uw.redis.get('http-api:guests');
  return toInt(guests);
}

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
  let activePlaylist = user ? user.getActivePlaylist() : null;
  const playlists = user ? user.getPlaylists() : null;
  const firstActivePlaylistItem = activePlaylist ? getFirstItem(user, activePlaylist) : null;
  const socketToken = user ? authRegistry.createAuthToken(user) : null;
  const authStrategies = passport.strategies();
  const time = Date.now();

  if (activePlaylist != null) {
    activePlaylist = activePlaylist
      .then((playlist) => (playlist ? playlist.id : null))
      .catch((err) => {
        // If the playlist was not found, our database is inconsistent. A deleted or nonexistent
        // playlist should never be listed as the active playlist. Most likely this is not the
        // user's fault, so we should not error out on `/api/now`. Instead, pretend they don't have
        // an active playlist at all. Clients can then let them select a new playlist to activate.
        if (err.code === 'NOT_FOUND') {
          debug('The active playlist does not exist', err);
          return null;
        }
        throw err;
      });
  }

  const stateShape = {
    motd,
    user,
    users,
    guests,
    roles,
    booth,
    waitlist,
    waitlistLocked,
    activePlaylist,
    firstActivePlaylistItem,
    playlists,
    socketToken,
    authStrategies,
    time,
  };

  const stateKeys = Object.keys(stateShape);
  const stateValues = await Promise.all(Object.values(stateShape));

  const state = {};
  for (let i = 0; i < stateKeys.length; i += 1) {
    state[stateKeys[i]] = stateValues[i];
  }

  if (state.playlists) {
    state.playlists = state.playlists.map(serializePlaylist);
  }

  return state;
}

exports.getState = getState;
