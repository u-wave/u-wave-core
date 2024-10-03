'use strict';

const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { sql } = require('kysely');

/** @param {unknown} value */
function jsonb(value) {
  return sql`jsonb(${JSON.stringify(value)})`;
}

/**
 * @param {import('umzug').MigrationParams<import('../Uwave').default>} params
 */
async function up({ context: uw }) {
  const { db } = uw;

  if (uw.options.mongo == null) {
    return;
  }

  const mongo = await mongoose.connect(uw.options.mongo).catch(() => null);
  if (mongo == null) {
    return;
  }

  const models = {
    AclRole: mongo.model('AclRole', await import('../models/AclRole.js').then((m) => m.default)),
    Authentication: mongo.model('Authentication', await import('../models/Authentication.js').then((m) => m.default)),
    Config: mongo.model('Config', await import('../models/Config.js').then((m) => m.default)),
    HistoryEntry: mongo.model('History', await import('../models/History.js').then((m) => m.default)),
    Media: mongo.model('Media', await import('../models/Media.js').then((m) => m.default)),
    Migration: mongo.model('Migration', await import('../models/Migration.js').then((m) => m.default)),
    Playlist: mongo.model('Playlist', await import('../models/Playlist.js').then((m) => m.default)),
    PlaylistItem: mongo.model('PlaylistItem', await import('../models/PlaylistItem.js').then((m) => m.default)),
    User: mongo.model('User', await import('../models/User.js').then((m) => m.default)),
  };

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

      if (user.roles.length > 0) {
        await tx.insertInto('userRoles')
          .values(user.roles.map((role) => ({ userID, role })))
          .execute();
      }

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
        })
        .execute();

      const feedback = new Map();
      for (const id of entry.upvotes) {
        feedback.set(id.toString(), {
          historyEntryID: entryID,
          userID: idMap.get(id.toString()),
          vote: 1,
        })
      }
      for (const id of entry.downvotes) {
        feedback.set(id.toString(), {
          historyEntryID: entryID,
          userID: idMap.get(id.toString()),
          vote: -1,
        })
      }
      for (const id of entry.favorites) {
        const entry = feedback.get(id.toString());
        if (entry != null) {
          entry.favorite = 1;
        } else {
          feedback.set(id.toString(), {
            historyEntryID: entryID,
            userID: idMap.get(id.toString()),
            favorite: 1,
          });
        }
      }

      if (feedback.size > 0) {
        await tx.insertInto('feedback')
          .values(Array.from(feedback.values()))
          .execute();
      }
    }
  })
  .finally(() => mongo.disconnect());
}

/**
 * @param {import('umzug').MigrationParams<import('../Uwave').default>} params
 */
async function down() {}

module.exports = { up, down };
