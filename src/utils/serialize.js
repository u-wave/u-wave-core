/**
 * @typedef {import('../models/index.js').User} User
 * @typedef {import('../models/index.js').Playlist} Playlist
 * @typedef {import('../models/Playlist.js').LeanPlaylist} LeanPlaylist
 */

/**
 * @param {Playlist | LeanPlaylist} model
 */
export function serializePlaylist(model) {
  return {
    _id: 'id' in model ? model.id : model._id.toString(),
    name: model.name,
    author: model.userID,
    createdAt: model.createdAt.toISOString(),
    description: model.description,
    size: model.size,
  };
}

/**
 * @param {Pick<User, '_id' | 'username' | 'slug' | 'roles' | 'avatar' |
 *   'createdAt' | 'updatedAt' | 'lastSeenAt'>} model
 */
export function serializeUser(model) {
  return {
    _id: 'id' in model ? model.id : model._id.toString(),
    username: model.username,
    slug: model.slug,
    roles: model.roles,
    avatar: model.avatar,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt?.toISOString(),
    lastSeenAt: model.lastSeenAt?.toISOString(),
  };
}
