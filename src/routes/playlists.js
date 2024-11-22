import { Router } from 'express';
import route from '../route.js';
import * as validations from '../validations.js';
import protect from '../middleware/protect.js';
import schema from '../middleware/schema.js';
import * as controller from '../controllers/playlists.js';

function playlistRoutes() {
  return Router()
    .use(protect())

    // GET /playlists/ - List playlists.
    .get(
      '/',
      schema(validations.getPlaylists),
      route(controller.getPlaylists),
    )
    // POST /playlists/ - Create a new playlist.
    .post(
      '/',
      schema(validations.createPlaylist),
      route(controller.createPlaylist),
    )

    // GET /playlists/:id - Get a single playlist's metadata (not items!).
    .get(
      '/:id',
      schema(validations.getPlaylist),
      route(controller.getPlaylist),
    )
    // DELETE /playlists/:id - Delete a playlist.
    .delete(
      '/:id',
      schema(validations.deletePlaylist),
      route(controller.deletePlaylist),
    )
    // PATCH /playlists/:id - Change playlist metadata, such as the name.
    .patch(
      '/:id',
      schema(validations.updatePlaylist),
      route(controller.updatePlaylist),
    )
    // PUT /playlists/:id/rename - Rename a playlist.
    // TODO should just be part of PATCH
    .put(
      '/:id/rename',
      schema(validations.renamePlaylist),
      route(controller.renamePlaylist),
    )
    // PUT /playlists/:id/activate - Set the playlist as active.
    // Should this be part of PATCH or should we have a `PUT /playlist/active`
    // that you can send the ID to?
    .put(
      '/:id/activate',
      route(controller.activatePlaylist),
    )
    // GET /playlists/:id/media - Get playlist items.
    .get(
      '/:id/media',
      schema(validations.getPlaylistItems),
      route(controller.getPlaylistItems),
    )
    // POST /playlists/:id/media - Add items to a playlist.
    .post(
      '/:id/media',
      schema(validations.addPlaylistItems),
      route(controller.addPlaylistItems),
    )
    // DELETE /playlists/:id/media - Delete items from a playlist.
    .delete(
      '/:id/media',
      schema(validations.removePlaylistItems),
      route(controller.removePlaylistItems),
    )
    // PUT /playlists/:id/move - Move playlist items.
    // TODO This should probably not be a PUT, but a POST
    // It's not idempotent!
    .put(
      '/:id/move',
      schema(validations.movePlaylistItems),
      route(controller.movePlaylistItems),
    )
    // POST /playlists/:id/shuffle - Shuffle a playlist's items.
    .post(
      '/:id/shuffle',
      schema(validations.shufflePlaylistItems),
      route(controller.shufflePlaylistItems),
    )
    // GET /playlists/:id/media/:itemID - Get a single playlist item.
    .get(
      '/:id/media/:itemID',
      schema(validations.getPlaylistItem),
      route(controller.getPlaylistItem),
    )
    // PUT /playlists/:id/media/:itemID - Change metadata for a playlist item.
    // TODO This should probably be a PATCH instead
    .put(
      '/:id/media/:itemID',
      schema(validations.updatePlaylistItem),
      route(controller.updatePlaylistItem),
    )
    // DELETE /playlists/:id/media/:itemID - Remove an item from the playlist.
    .delete(
      '/:id/media/:itemID',
      schema(validations.removePlaylistItem),
      route(controller.removePlaylistItem),
    );
}

export default playlistRoutes;
