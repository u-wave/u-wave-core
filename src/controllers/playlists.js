import { HTTPError, PlaylistNotFoundError, PlaylistItemNotFoundError } from '../errors/index.js';
import { serializePlaylist, serializePlaylistItem } from '../utils/serialize.js';
import getOffsetPagination from '../utils/getOffsetPagination.js';
import toItemResponse from '../utils/toItemResponse.js';
import toListResponse from '../utils/toListResponse.js';
import toPaginatedResponse from '../utils/toPaginatedResponse.js';

/**
 * @typedef {import('../schema').PlaylistID} PlaylistID
 * @typedef {import('../schema').PlaylistItemID} PlaylistItemID
 * @typedef {import('../schema').MediaID} MediaID
 */

/**
 * @typedef {object} GetPlaylistsQuery
 * @prop {MediaID} [contains]
 */

/**
 * @type {import('../types.js').AuthenticatedController<{}, GetPlaylistsQuery>}
 */
async function getPlaylists(req) {
  const { user } = req;
  const uw = req.uwave;
  const { contains } = req.query;

  let playlists;
  if (contains) {
    playlists = await uw.playlists.getPlaylistsContainingMedia(contains, { author: user.id });
  } else {
    playlists = await uw.playlists.getUserPlaylists(user);
  }

  return toListResponse(
    playlists.map(serializePlaylist),
    { url: req.fullUrl },
  );
}

/**
 * @typedef {object} GetPlaylistParams
 * @prop {PlaylistID} id
 */

/**
 * @type {import('../types.js').AuthenticatedController<GetPlaylistParams>}
 */
async function getPlaylist(req) {
  const { user } = req;
  const { playlists } = req.uwave;
  const { id } = req.params;

  const playlist = await playlists.getUserPlaylist(user, id);

  if (!playlist) {
    throw new PlaylistNotFoundError({ id });
  }

  return toItemResponse(
    serializePlaylist(playlist),
    { url: req.fullUrl },
  );
}

/**
 * @typedef {object} CreatePlaylistBody
 * @prop {string} name
 */

/**
 * @type {import('../types.js').AuthenticatedController<{}, {}, CreatePlaylistBody>}
 */
async function createPlaylist(req) {
  const { user } = req;
  const { name } = req.body;
  const { playlists } = req.uwave;

  const { playlist, active } = await playlists.createPlaylist(user, {
    name,
  });

  return toItemResponse(
    serializePlaylist(playlist),
    {
      url: req.fullUrl,
      meta: { active },
    },
  );
}

/**
 * @typedef {object} DeletePlaylistParams
 * @prop {PlaylistID} id
 */

/**
 * @type {import('../types.js').AuthenticatedController<DeletePlaylistParams>}
 */
async function deletePlaylist(req) {
  const { user } = req;
  const { id } = req.params;
  const { playlists } = req.uwave;

  const playlist = await playlists.getUserPlaylist(user, id);
  if (!playlist) {
    throw new PlaylistNotFoundError({ id });
  }

  await playlists.deletePlaylist(playlist);

  return toItemResponse({}, { url: req.fullUrl });
}

const patchableKeys = ['name', 'description'];

/**
 * @typedef {object} UpdatePlaylistParams
 * @prop {PlaylistID} id
 *
 * @typedef {Record<string, string>} UpdatePlaylistBody
 */

/**
 * @type {import('../types.js').AuthenticatedController<
 *     UpdatePlaylistParams, {}, UpdatePlaylistBody>}
 */
async function updatePlaylist(req) {
  const { user } = req;
  const { id } = req.params;
  const patch = req.body;
  const { playlists } = req.uwave;

  const patches = Object.keys(patch);
  patches.forEach((patchKey) => {
    if (!patchableKeys.includes(patchKey)) {
      throw new HTTPError(400, `Key "${patchKey}" cannot be updated.`);
    }
  });

  const playlist = await playlists.getUserPlaylist(user, id);
  if (!playlist) {
    throw new PlaylistNotFoundError({ id });
  }

  const updatedPlaylist = await playlists.updatePlaylist(playlist, patch);

  return toItemResponse(
    serializePlaylist(updatedPlaylist),
    { url: req.fullUrl },
  );
}

/**
 * @typedef {object} RenamePlaylistParams
 * @prop {PlaylistID} id
 *
 * @typedef {object} RenamePlaylistBody
 * @prop {string} name
 */

/**
 * @type {import('../types.js').AuthenticatedController<
 *     RenamePlaylistParams, {}, RenamePlaylistBody>}
 */
async function renamePlaylist(req) {
  const { user } = req;
  const { id } = req.params;
  const { name } = req.body;
  const { playlists } = req.uwave;

  const playlist = await playlists.getUserPlaylist(user, id);
  if (!playlist) {
    throw new PlaylistNotFoundError({ id });
  }

  const updatedPlaylist = await playlists.updatePlaylist(playlist, { name });

  return toItemResponse(
    serializePlaylist(updatedPlaylist),
    { url: req.fullUrl },
  );
}

/**
 * @typedef {object} ActivatePlaylistParams
 * @prop {PlaylistID} id
 */

/**
 * @type {import('../types.js').AuthenticatedController<ActivatePlaylistParams>}
 */
async function activatePlaylist(req) {
  const { user } = req;
  const { db, playlists } = req.uwave;
  const { id } = req.params;

  const playlist = await playlists.getUserPlaylist(user, id);
  if (!playlist) {
    throw new PlaylistNotFoundError({ id });
  }

  await db.updateTable('users')
    .where('id', '=', user.id)
    .set({ activePlaylistID: playlist.id })
    .execute();

  return toItemResponse({});
}

/**
 * @typedef {object} GetPlaylistItemsParams
 * @prop {PlaylistID} id
 *
 * @typedef {import('../types.js').PaginationQuery & { filter?: string }} GetPlaylistItemsQuery
 */

/**
 * @type {import('../types.js').AuthenticatedController<
 *     GetPlaylistItemsParams, GetPlaylistItemsQuery>}
 */
async function getPlaylistItems(req) {
  const { user } = req;
  const { playlists } = req.uwave;
  const { id } = req.params;
  const filter = req.query.filter ?? undefined;
  const pagination = getOffsetPagination(req.query);

  const playlist = await playlists.getUserPlaylist(user, id);
  if (!playlist) {
    throw new PlaylistNotFoundError({ id });
  }

  const items = await playlists.getPlaylistItems(playlist, filter, pagination);

  return toPaginatedResponse(items, {
    baseUrl: req.fullUrl,
    included: {
      media: ['media'],
    },
  });
}

/**
 * @typedef {import('../plugins/playlists.js').PlaylistItemDesc} PlaylistItemDesc
 *
 * @typedef {object} AddPlaylistItemsParams
 * @prop {PlaylistID} id
 *
 * @typedef {object} AtPosition
 * @prop {'start'|'end'} at
 * @prop {undefined} after
 *
 * @typedef {object} AfterPosition
 * @prop {undefined} at
 * @prop {PlaylistItemID|-1} after
 *
 * @typedef {{ items: PlaylistItemDesc[] } & (AtPosition | AfterPosition)} AddPlaylistItemsBody
 */

/**
 * @type {import('../types.js').AuthenticatedController<
 *     AddPlaylistItemsParams, {}, AddPlaylistItemsBody>}
 */
async function addPlaylistItems(req) {
  const { user } = req;
  const { playlists } = req.uwave;
  const { id } = req.params;
  const { at, after, items } = req.body;

  const playlist = await playlists.getUserPlaylist(user, id);
  if (!playlist) {
    throw new PlaylistNotFoundError({ id });
  }

  /** @type {PlaylistItemID|null} */
  let afterID = null;
  if (at === 'start') {
    afterID = null;
  } else if (at === 'end' || after === -1) {
    afterID = playlist.media[playlist.size - 1];
  } else if (after !== null) {
    afterID = after;
  }

  const {
    added,
    afterID: actualAfterID,
    playlistSize,
  } = await playlists.addPlaylistItems(playlist, items, { after: afterID });

  return toListResponse(added.map(serializePlaylistItem), {
    included: {
      media: ['media'],
    },
    meta: {
      afterID: actualAfterID ? actualAfterID.toString() : null,
      playlistSize,
    },
  });
}

/**
 * @typedef {object} RemovePlaylistItemsParams
 * @prop {PlaylistID} id
 *
 * @typedef {object} RemovePlaylistItemsBody
 * @prop {PlaylistItemID[]} items
 */

/**
 * @type {import('../types.js').AuthenticatedController<
 *     RemovePlaylistItemsParams, {}, RemovePlaylistItemsBody>}
 */
async function removePlaylistItems(req) {
  const { user } = req;
  const { playlists } = req.uwave;
  const { id } = req.params;
  const { items } = req.body;

  const playlist = await playlists.getUserPlaylist(user, id);
  if (!playlist) {
    throw new PlaylistNotFoundError({ id });
  }

  await playlists.removePlaylistItems(playlist, items);

  return toItemResponse({}, {
    meta: {
      playlistSize: playlist.size,
    },
  });
}

/**
 * @typedef {object} MovePlaylistItemsParams
 * @prop {PlaylistID} id
 *
 * @typedef {{ items: PlaylistItemID[] } & (AtPosition | AfterPosition)} MovePlaylistItemsBody
 */

/**
 * @type {import('../types.js').AuthenticatedController<
 *     MovePlaylistItemsParams, {}, MovePlaylistItemsBody>}
 */
async function movePlaylistItems(req) {
  const { user } = req;
  const { playlists } = req.uwave;
  const { id } = req.params;
  const { at, after, items } = req.body;

  const playlist = await playlists.getUserPlaylist(user, id);
  if (!playlist) {
    throw new PlaylistNotFoundError({ id });
  }

  /** @type {PlaylistItemID|null} */
  let afterID = null;
  if (at === 'start') {
    afterID = null;
  } else if (at === 'end' || after === -1) {
    afterID = playlist.media[playlist.size - 1];
  } else if (after != null) {
    afterID = after;
  }

  const itemIDs = items.map((item) => item);
  const result = await playlists.movePlaylistItems(playlist, itemIDs, { afterID });

  return toItemResponse(result, { url: req.fullUrl });
}

/**
 * @typedef {object} ShufflePlaylistItemsParams
 * @prop {PlaylistID} id
 */

/**
 * @type {import('../types.js').AuthenticatedController<ShufflePlaylistItemsParams>}
 */
async function shufflePlaylistItems(req) {
  const { user } = req;
  const { playlists } = req.uwave;
  const { id } = req.params;

  const playlist = await playlists.getUserPlaylist(user, id);
  if (!playlist) {
    throw new PlaylistNotFoundError({ id });
  }

  await playlists.shufflePlaylist(playlist);

  return toItemResponse({});
}

/**
 * @typedef {object} GetPlaylistItemParams
 * @prop {PlaylistID} id
 * @prop {PlaylistItemID} itemID
 */

/**
 * @type {import('../types.js').AuthenticatedController<GetPlaylistItemParams>}
 */
async function getPlaylistItem(req) {
  const { user } = req;
  const { playlists } = req.uwave;
  const { id, itemID } = req.params;

  const playlist = await playlists.getUserPlaylist(user, id);
  if (!playlist) {
    throw new PlaylistNotFoundError({ id });
  }

  const item = await playlists.getPlaylistItem(playlist, itemID);
  if (!item) {
    throw new PlaylistItemNotFoundError({ playlist, id: itemID });
  }

  return toItemResponse(item, { url: req.fullUrl });
}

/**
 * @typedef {object} UpdatePlaylistItemParams
 * @prop {PlaylistID} id
 * @prop {PlaylistItemID} itemID
 *
 * @typedef {object} UpdatePlaylistItemBody
 * @prop {string} [artist]
 * @prop {string} [title]
 * @prop {number} [start]
 * @prop {number} [end]
 */

/**
 * @type {import('../types.js').AuthenticatedController<
 *     UpdatePlaylistItemParams, {}, UpdatePlaylistItemBody>}
 */
async function updatePlaylistItem(req) {
  const { user } = req;
  const { playlists } = req.uwave;
  const { id, itemID } = req.params;
  const {
    artist, title, start, end,
  } = req.body;

  const patch = {
    artist,
    title,
    start,
    end,
  };

  const playlist = await playlists.getUserPlaylist(user, id);
  if (!playlist) {
    throw new PlaylistNotFoundError({ id });
  }

  const item = await playlists.getPlaylistItem(playlist, itemID);
  const updatedItem = await playlists.updatePlaylistItem(item, patch);

  return toItemResponse(updatedItem, { url: req.fullUrl });
}

/**
 * @typedef {object} RemovePlaylistItemParams
 * @prop {PlaylistID} id
 * @prop {PlaylistItemID} itemID
 */

/**
 * @type {import('../types.js').AuthenticatedController<RemovePlaylistItemParams>}
 */
async function removePlaylistItem(req) {
  const { user } = req;
  const { playlists } = req.uwave;
  const { id, itemID } = req.params;

  const playlist = await playlists.getUserPlaylist(user, id);
  if (!playlist) {
    throw new PlaylistNotFoundError({ id });
  }

  await playlists.removePlaylistItems(playlist, [itemID]);

  return toItemResponse({}, { url: req.fullUrl });
}

export {
  getPlaylists,
  getPlaylist,
  createPlaylist,
  deletePlaylist,
  updatePlaylist,
  renamePlaylist,
  activatePlaylist,
  getPlaylistItems,
  addPlaylistItems,
  removePlaylistItems,
  movePlaylistItems,
  shufflePlaylistItems,
  getPlaylistItem,
  updatePlaylistItem,
  removePlaylistItem,
};
