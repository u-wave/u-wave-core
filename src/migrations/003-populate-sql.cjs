'use strict';

const { randomUUID } = require('node:crypto');
const { sql } = require('kysely');

/** @param {unknown} value */
function jsonb(value) {
  return sql`jsonb(${JSON.stringify(value)})`;
}

/**
 * @param {import('umzug').MigrationParams<import('../Uwave').default>} params
 */
async function up({ context: uw }) {
  const { db, models } = uw;

  /** @type {Map<string, string>} */
  const idMap = new Map();

  await db.transaction().execute(async (tx) => {
    for await (const config of models.Config.find().lean()) {
      const { _id: name, ...value } = config;
      await tx.insertInto('configuration')
        .values({ name, value: jsonb(value) })
        .execute();
    }

    for await (const media of models.Media.find().lean()) {
      const id = randomUUID();
      await tx.insertInto('media')
        .values({
          id,
          sourceType: media.sourceType,
          sourceID: media.sourceID,
          sourceData: jsonb(media.sourceData),
          artist: media.artist,
          title: media.title,
          duration: media.duration,
          thumbnail: media.thumbnail,
          createdAt: media.createdAt.toISOString(),
          updatedAt: media.updatedAt.toISOString(),
        })
        .onConflict((conflict) => conflict.columns(['sourceType', 'sourceID']).doUpdateSet({
          updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        }))
        .execute();

      idMap.set(media._id.toString(), id);
    }

    const roles = await models.AclRole.find().lean();
    /** @type {Record<string, string[]>} */
    const roleMap = Object.create(null);
    for (const role of roles) {
      if (role._id.includes('.') || role._id === '*') {
        continue;
      }

      roleMap[role._id] = role.roles ?? [];
    }
    const permissionRows = Object.entries(roleMap).map(([role, permissions]) => ({
      id: role,
      permissions: jsonb(
        permissions.flatMap((perm) => perm.includes('.') || perm === '*' ? [perm] : roleMap[perm]),
      ),
    }));

    if (permissionRows.length > 0) {
      await tx.insertInto('roles')
        .values(permissionRows)
        .execute();
    }

    for await (const user of models.User.find().lean()) {
      const userID = randomUUID();
      idMap.set(user._id.toString(), userID);

      await tx.insertInto('users')
        .values({
          id: userID,
          username: user.username,
          slug: user.slug,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        })
        .execute();

      for await (const playlist of models.Playlist.where('author', user._id).lean()) {
        const playlistID = randomUUID();
        idMap.set(playlist._id.toString(), playlistID);

        await tx.insertInto('playlists')
          .values({
            id: playlistID,
            name: playlist.name,
            userID,
            createdAt: playlist.createdAt.toISOString(),
            updatedAt: playlist.updatedAt.toISOString(),
          })
          .execute();

        const items = [];
        for (const itemMongoID of playlist.media) {
          const itemID = randomUUID();
          idMap.set(itemMongoID.toString(), itemID);

          const item = await models.PlaylistItem.findById(itemMongoID).lean();
          await tx.insertInto('playlistItems')
            .values({
              id: itemID,
              playlistID,
              mediaID: idMap.get(item.media.toString()),
              artist: item.artist,
              title: item.title,
              start: item.start,
              end: item.end,
              createdAt: item.createdAt.toISOString(),
              updatedAt: item.updatedAt.toISOString(),
            })
            .execute();

          items.push(itemID);
        }

        await tx.updateTable('playlists')
          .where('id', '=', playlistID)
          .set({ items: jsonb(items) })
          .execute();
      }
    }

    for await (const entry of models.Authentication.find().lean()) {
      const userID = idMap.get(entry.user.toString());
      if (userID == null) {
        throw new Error('Migration failure: unknown user ID');
      }

      if (entry.email != null) {
        await tx.updateTable('users')
          .where('id', '=', userID)
          .set({ email: entry.email })
          .execute();
      }

      if (entry.hash != null) {
        await tx.updateTable('users')
          .where('id', '=', userID)
          .set({ password: entry.hash })
          .execute();
      }
    }

    for await (const entry of models.HistoryEntry.find().lean()) {
      const entryID = randomUUID();
      idMap.set(entry._id.toString(), entryID);
      const userID = idMap.get(entry.user.toString());
      const mediaID = idMap.get(entry.media.media.toString());
      await tx.insertInto('historyEntries')
        .values({
          id: entryID,
          mediaID,
          userID,
          artist: entry.media.artist,
          title: entry.media.title,
          start: entry.media.start,
          end: entry.media.end,
          sourceData: jsonb(entry.media.sourceData),
          createdAt: entry.playedAt.toISOString(),
          // TODO vote statistics
        })
        .execute();
    }
  });
}

/**
 * @param {import('umzug').MigrationParams<import('../Uwave').default>} params
 */
async function down() {}

module.exports = { up, down };
