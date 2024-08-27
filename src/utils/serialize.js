/**
 * @param {import('../schema.js').Playlist & { size: number }} model
 */
export function serializePlaylist(model) {
  return {
    _id: model.id,
    name: model.name,
    author: model.userID,
    createdAt: model.createdAt.toISOString(),
    description: '',
    size: model.size,
  };
}

/**
 * @param {import('../schema.js').User} model
 */
export function serializeUser(model) {
  return {
    _id: model.id,
    username: model.username,
    slug: model.slug,
    roles: model.roles,
    avatar: model.avatar,
    activePlaylist: model.activePlaylistID,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt?.toISOString(),
    lastSeenAt: model.lastSeenAt?.toISOString(),
  };
}
