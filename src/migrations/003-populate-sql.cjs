'use strict';

const { randomUUID } = require('node:crypto');
const { sql } = require('kysely');

/**
 * @param {import('umzug').MigrationParams<import('../Uwave').default>} params
 */
async function up({ context: uw }) {
  const { db } = uw;

  const users = await uw.models.User.find().lean();
  const medias = await uw.models.Media.find().lean();

  /** @type {Map<string, string>} */
  const idMap = new Map();

  await db.transaction().execute(async (tx) => {
    for (const media of medias) {
      const id = randomUUID();
      await tx.insertInto('media')
        .values({
          id,
          sourceType: media.sourceType,
          sourceID: media.sourceID,
          sourceData: media.sourceData,
          artist: media.artist,
          title: media.title,
          duration: media.duration,
          thumbnail: media.thumbnail,
          createdAt: media.createdAt,
          updatedAt: media.updatedAt,
        })
        .onConflict((conflict) => conflict.constraint('source_key').doUpdateSet({
          updatedAt: (eb) => eb.ref('EXCLUDED.updatedAt'),
        }))
        .execute();

      idMap.set(media._id.toString(), id);
    }

    for (const user of users) {
      const userID = randomUUID();
      idMap.set(user._id.toString(), userID);

      await tx.insertInto('users')
        .values({
          id: userID,
          username: user.username,
          slug: user.slug,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })
        .execute();

      for await (const playlist of uw.models.Playlist.where('author', user._id).lean()) {
        const playlistID = randomUUID();
        idMap.set(playlist._id.toString(), playlistID);

        await tx.insertInto('playlists')
          .values({
            id: playlistID,
            name: playlist.name,
            userID,
            createdAt: playlist.createdAt,
            updatedAt: playlist.updatedAt,
          })
          .execute();

        for (const itemMongoID of playlist.media) {
          const itemID = randomUUID();
          idMap.set(itemMongoID.toString(), itemID);

          const item = await uw.models.PlaylistItem.findById(itemMongoID).lean();
          await tx.insertInto('playlistItems')
            .values({
              id: itemID,
              playlistID,
              mediaID: idMap.get(item.media.toString()),
              artist: item.artist,
              title: item.title,
              start: item.start,
              end: item.end,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            })
            .execute();
        }
      }
    }
  });
}

/**
 * @param {import('umzug').MigrationParams<import('../Uwave').default>} params
 */
async function down() {}

module.exports = { up, down };
