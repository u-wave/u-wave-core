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
 * @param {{
 *   id: import('../schema.js').PlaylistItemID,
 *   media: import('../schema.js').Media,
 *   artist: string,
 *   title: string,
 *   start: number,
 *   end: number,
 *   createdAt?: Date,
 *   updatedAt?: Date,
 * }} model
 */
export function serializePlaylistItem(model) {
  return {
    _id: model.id,
    media: model.media,
    artist: model.artist,
    title: model.title,
    start: model.start,
    end: model.end,
    createdAt: model.createdAt?.toISOString(),
    updatedAt: model.updatedAt?.toISOString(),
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
