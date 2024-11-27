'use strict';

const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { sql } = require('kysely');

const { Types } = mongoose.Schema;

/** @param {unknown} value */
function jsonb(value) {
  return sql`jsonb(${JSON.stringify(value)})`;
}

/**
 * @typedef {object} LeanAclRole
 * @prop {string} _id
 * @prop {string[]} roles
 * @typedef {mongoose.Document<LeanAclRole["_id"], {}, LeanAclRole> & LeanAclRole} AclRole
 */

/**
 * @type {mongoose.Schema<AclRole, mongoose.Model<AclRole>>}
 */
const aclRoleSchema = new mongoose.Schema({
  _id: String,
  roles: [{ type: String, ref: 'AclRole', index: true }],
}, {
  collection: 'acl_roles',
  minimize: true,
});

/**
 * @typedef {object} LeanAuthentication
 * @prop {import('mongodb').ObjectId} _id
 * @prop {import('mongodb').ObjectId} user
 * @prop {string} type
 * @prop {string} [email]
 * @prop {string} [hash]
 * @prop {string} [id]
 * @prop {string} [avatar]
 * @typedef {mongoose.Document<LeanAuthentication["_id"], {}, LeanAuthentication> &
 *           LeanAuthentication} Authentication
 */

/**
 * @type {mongoose.Schema<Authentication, mongoose.Model<Authentication>>}
 */
const authenticationSchema = new mongoose.Schema({
  user: { type: Types.ObjectId, ref: 'User', index: true },
  type: { type: String, required: true, default: 'local' },
  // Local login
  email: {
    type: String, max: 254, unique: true, index: true,
  },
  hash: { type: String },
  // Social login
  id: { type: String },
  avatar: { type: String, required: false },
}, {
  timestamps: true,
  minimize: false,
});

/**
 * @typedef {object} LeanConfig
 * @prop {string} _id
 * @typedef {mongoose.Document<LeanConfig["_id"], {}, LeanConfig> &
 *           LeanConfig} Config
 */

/**
 * @type {mongoose.Schema<Config, mongoose.Model<Config>>}
 */
const configSchema = new mongoose.Schema({
  _id: { type: String },
}, {
  collection: 'config_store',
  strict: false,
  toJSON: { versionKey: false },
});

const listOfUsers = [{ type: Types.ObjectId, ref: 'User' }];

/**
 * @typedef {import('type-fest').JsonObject} HistorySourceData
 */

/**
 * @typedef {object} HistoryMedia
 * @prop {import('mongodb').ObjectId} media
 *     Reference to the `Media` object that is being played.
 * @prop {string} artist
 *     Snapshot of the media artist name at the time this entry was played.
 * @prop {string} title
 *     Snapshot of the media title at the time this entry was played.
 * @prop {number} start
 *     Time to start playback at.
 * @prop {number} end
 *     Time to stop playback at.
 * @prop {HistorySourceData} sourceData
 *     Arbitrary source-specific data required for media playback.
 */

/**
 * @typedef {object} LeanHistoryEntry
 * @prop {import('mongodb').ObjectId} _id
 * @prop {import('mongodb').ObjectId} user
 * @prop {import('mongodb').ObjectId} playlist
 * @prop {import('mongodb').ObjectId} item
 * @prop {mongoose.Document<never, {}, HistoryMedia> & HistoryMedia} media
 * @prop {Date} playedAt
 * @prop {import('mongodb').ObjectId[]} upvotes
 * @prop {import('mongodb').ObjectId[]} downvotes
 * @prop {import('mongodb').ObjectId[]} favorites
 */

/**
 * @typedef {mongoose.Document<LeanHistoryEntry["_id"], {}, LeanHistoryEntry> &
 *           LeanHistoryEntry} HistoryEntry
 */

/**
 * @type {mongoose.Schema<HistoryEntry, mongoose.Model<HistoryEntry>>}
 */
const historySchema = new mongoose.Schema({
  user: {
    type: Types.ObjectId, ref: 'User', required: true, index: true,
  },
  playlist: { type: Types.ObjectId, ref: 'Playlist' },
  item: { type: Types.ObjectId, ref: 'PlaylistItem' },
  media: {
    media: { type: Types.ObjectId, ref: 'Media', required: true },
    artist: {
      type: String,
      index: true,
      /** @type {(name: string) => string} */
      set: (artist) => artist.normalize('NFKC'),
    },
    title: {
      type: String,
      index: true,
      /** @type {(name: string) => string} */
      set: (title) => title.normalize('NFKC'),
    },
    start: { type: Number, default: 0 },
    end: { type: Number, default: 0 },
    // Bypass typecheck as JsonObject is a recursive structure & causes infinite looping here.
    /** @type {any} */
    sourceData: { type: Object, select: false },
  },
  playedAt: { type: Date, default: () => new Date(), index: true },
  upvotes: listOfUsers,
  downvotes: listOfUsers,
  favorites: listOfUsers,
}, {
  collection: 'historyentries',
  minimize: false,
});

/**
 * @typedef {object} LeanMedia
 * @prop {import('mongodb').ObjectId} _id
 * @prop {string} sourceID
 * @prop {string} sourceType
 * @prop {object} sourceData
 * @prop {string} artist
 * @prop {string} title
 * @prop {number} duration
 * @prop {string} thumbnail
 * @prop {Date} createdAt
 * @prop {Date} updatedAt
 * @typedef {mongoose.Document<LeanMedia["_id"], {}, LeanMedia> & LeanMedia} Media
 */

/**
 * @type {mongoose.Schema<Media, mongoose.Model<Media>>}
 */
const mediaSchema = new mongoose.Schema({
  sourceID: {
    type: String, max: 128, required: true, index: true,
  },
  sourceType: {
    type: String, max: 128, required: true, index: true,
  },
  sourceData: {},
  artist: {
    type: String,
    max: 128,
    required: true,
    /** @type {(name: string) => string} */
    set: (artist) => artist.normalize('NFKC'),
  },
  title: {
    type: String,
    max: 128,
    required: true,
    /** @type {(name: string) => string} */
    set: (title) => title.normalize('NFKC'),
  },
  duration: { type: Number, min: 0, default: 0 },
  thumbnail: { type: String, max: 256, default: '' },
}, {
  timestamps: true,
  minimize: false,
});

/**
 * @typedef {object} LeanMigration
 * @prop {import('mongodb').ObjectId} _id
 * @prop {string} migrationName
 * @prop {Date} createdAt
 * @prop {Date} updatedAt
 * @typedef {mongoose.Document<LeanMigration["_id"], {}, LeanMigration> & LeanMigration} Migration
 */

/**
 * @type {mongoose.Schema<Migration, mongoose.Model<Migration>>}
 */
const migrationSchema = new mongoose.Schema({
  migrationName: { type: String, required: true },
}, {
  timestamps: true,
  collection: 'migrations',
});

/**
 * @typedef {object} LeanPlaylist
 * @prop {import('mongodb').ObjectId} _id
 * @prop {string} name
 * @prop {string} description
 * @prop {import('mongodb').ObjectId} author
 * @prop {import('mongodb').ObjectId[]} media
 * @prop {Date} createdAt
 * @prop {Date} updatedAt
 * @typedef {mongoose.Document<LeanPlaylist["_id"], {}, LeanPlaylist> & LeanPlaylist & {
 *  readonly size: number
 * }} Playlist
 */

/**
 * @type {mongoose.Schema<Playlist, mongoose.Model<Playlist>>}
 */
const playlistSchema = new mongoose.Schema({
  name: {
    type: String,
    min: 0,
    max: 128,
    required: true,
    /** @type {(name: string) => string} */
    set: (name) => name.normalize('NFKC'),
  },
  description: { type: String, min: 0, max: 512 },
  author: {
    type: Types.ObjectId, ref: 'User', required: true, index: true,
  },
  media: [{
    type: Types.ObjectId,
    ref: 'PlaylistItem',
    required: true,
    index: true,
  }],
}, {
  collection: 'playlists',
  timestamps: true,
  toJSON: { getters: true },
  minimize: false,
});

/**
 * @typedef {object} LeanPlaylistItem
 * @prop {import('mongodb').ObjectId} _id
 * @prop {import('mongodb').ObjectId} media
 * @prop {string} artist
 * @prop {string} title
 * @prop {number} start
 * @prop {number} end
 * @prop {Date} createdAt
 * @prop {Date} updatedAt
 * @typedef {mongoose.Document<LeanPlaylistItem["_id"], {}, LeanPlaylistItem> &
 *           LeanPlaylistItem} PlaylistItem
 */

/**
 * @type {mongoose.Schema<PlaylistItem, mongoose.Model<PlaylistItem>>}
 */
const playlistItemSchema = new mongoose.Schema({
  media: {
    type: Types.ObjectId,
    ref: 'Media',
    required: true,
    index: true,
  },
  artist: {
    type: String,
    max: 128,
    required: true,
    index: true,
    /** @type {(name: string) => string} */
    set: (artist) => artist.normalize('NFKC'),
  },
  title: {
    type: String,
    max: 128,
    required: true,
    index: true,
    /** @type {(name: string) => string} */
    set: (title) => title.normalize('NFKC'),
  },
  start: { type: Number, min: 0, default: 0 },
  end: { type: Number, min: 0, default: 0 },
}, {
  timestamps: true,
  minimize: false,
});

/**
 * @typedef {object} LeanBanned
 * @prop {import('mongodb').ObjectId} moderator
 * @prop {number} duration
 * @prop {Date} [expiresAt]
 * @prop {string} reason
 */

/**
 * @typedef {object} LeanUser
 * @prop {import('mongodb').ObjectId} _id
 * @prop {string} username
 * @prop {string} language
 * @prop {string[]} roles
 * @prop {string} avatar
 * @prop {string} slug
 * @prop {import('mongodb').ObjectId|null} activePlaylist
 * @prop {Date} lastSeenAt
 * @prop {LeanBanned|undefined} banned
 * @prop {string|undefined} pendingActivation
 * @prop {Date} createdAt
 * @prop {Date} updatedAt
 * @prop {number} role - Deprecated, do not use
 * @prop {number} level - Deprecated, do not use
 * @prop {boolean} exiled - Deprecated, do not use
 * @typedef {mongoose.Document<LeanUser["_id"], {}, LeanUser> & LeanUser} User
 */

const bannedSchema = new mongoose.Schema({
  moderator: { type: Types.ObjectId, ref: 'User', index: true },
  duration: { type: Number, required: true },
  expiresAt: { type: Date, required: true, index: true },
  reason: { type: String, default: '' },
});

/**
 * @type {mongoose.Schema<User, mongoose.Model<User, {}, {}>, {}>}
 */
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    minlength: [3, 'Usernames have to be at least 3 characters long.'],
    maxlength: [32, 'Usernames can be at most 32 characters long.'],
    match: /^[^\s]+$/,
    required: true,
    unique: true,
    index: true,
    /** @type {(name: string) => string} */
    set: (name) => name.normalize('NFKC'),
  },
  language: {
    type: String, min: 2, max: 2, default: 'en',
  },
  roles: [{ type: String, ref: 'AclRole' }],
  // Deprecated, `roles` should be used instead.
  // However some clients (*cough* u-wave-web *cough*) haven't updated to the
  // ACL system so they need this key to exist.
  role: { type: Number, min: 0, default: 0 },
  avatar: {
    type: String, min: 0, max: 256, default: '',
  },
  slug: {
    type: String,
    unique: true,
    required: [true, 'Usernames must not consist of punctuation only.'],
    index: true,
  },
  activePlaylist: {
    type: Types.ObjectId,
    ref: 'Playlist',
  },
  level: {
    type: Number, min: 0, max: 9001, default: 0,
  },
  lastSeenAt: { type: Date, default: () => new Date() },
  exiled: { type: Boolean, default: false },
  banned: bannedSchema,
  pendingActivation: { type: String, required: false },
}, {
  timestamps: true,
  minimize: false,
});

async function* asyncChunks(iter, chunkSize) {
  let chunk = [];
  for await (const element of iter) {
    chunk.push(element);
    if (chunk.length >= chunkSize) {
      yield chunk;
      chunk = [];
    }
  }
  if (chunk.length > 0) {
    yield chunk;
  }
}

function zip(a, b) {
  const iterA = a[Symbol.iterator]();
  const iterB = b[Symbol.iterator]();
  const iter = {
    next() {
      const itemA = iterA.next();
      const itemB = iterB.next();

      if (itemA.done !== itemB.done) {
        throw new Error('zip: iterators have different lengths')
      }

      return {
        value: [itemA.value, itemB.value],
        done: itemA.done,
      };
    },
  };
  iter[Symbol.iterator] = () => iter;
  return iter;
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
    AclRole: mongo.model('AclRole', aclRoleSchema),
    Authentication: mongo.model('Authentication', authenticationSchema),
    Config: mongo.model('Config', configSchema),
    HistoryEntry: mongo.model('History', historySchema),
    Media: mongo.model('Media', mediaSchema),
    Migration: mongo.model('Migration', migrationSchema),
    Playlist: mongo.model('Playlist', playlistSchema),
    PlaylistItem: mongo.model('PlaylistItem', playlistItemSchema),
    User: mongo.model('User', userSchema),
  };

  // For now redis is still required.
  const motd = await uw.redis.get('motd');

  /** @type {Map<string, string>} */
  const mediaIDs = new Map();
  /** @type {Map<string, string>} */
  const userIDs = new Map();
  /** @type {Map<string, string>} */
  const playlistIDs = new Map();
  /** @type {Map<string, string>} */
  const playlistItemIDs = new Map();

  await db.transaction().execute(async (tx) => {
    for await (const config of models.Config.find().lean()) {
      const { _id: name, ...value } = config;
      await tx.insertInto('configuration')
        .values({ name, value: jsonb(value) })
        .execute();
    }

    if (motd != null && motd !== '') {
      await tx.insertInto('configuration')
        .values({ name: 'u-wave:motd', value: jsonb(motd) })
        .execute();
    }

    for await (const medias of asyncChunks(models.Media.find().lean(), 50)) {
      const rows = await tx.insertInto('media')
        .values(medias.map((media) => ({
          id: randomUUID(),
          sourceType: media.sourceType,
          sourceID: media.sourceID,
          sourceData: jsonb(media.sourceData),
          artist: media.artist,
          title: media.title ?? '',
          duration: media.duration,
          thumbnail: media.thumbnail,
          createdAt: (media.createdAt ?? media.updatedAt ?? new Date()).toISOString(),
          updatedAt: (media.updatedAt ?? new Date()).toISOString(),
        })))
        .onConflict((conflict) => conflict.columns(['sourceType', 'sourceID']).doUpdateSet({
          updatedAt: (eb) => eb.ref('excluded.updatedAt'),
        }))
        .returning('id')
        .execute();

      for (const [media, row] of zip(medias, rows)) {
        mediaIDs.set(media._id.toString(), row.id);
      }
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
      userIDs.set(user._id.toString(), userID);

      await tx.insertInto('users')
        .values({
          id: userID,
          username: user.username,
          slug: user.slug,
          createdAt: user.createdAt.toISOString(),
          updatedAt: (user.updatedAt ?? user.createdAt).toISOString(),
        })
        .execute();

      if (user.roles.length > 0) {
        await tx.insertInto('userRoles')
          .values(user.roles.map((role) => ({ userID, role })))
          .execute();
      }

      for await (const playlist of models.Playlist.where('author', user._id).lean()) {
        const playlistID = randomUUID();
        playlistIDs.set(playlist._id.toString(), playlistID);

        await tx.insertInto('playlists')
          .values({
            id: playlistID,
            name: playlist.name,
            userID,
            // Old objects use the `.created` property
            createdAt: (playlist.createdAt ?? playlist.created).toISOString(),
            updatedAt: (playlist.updatedAt ?? playlist.created).toISOString(),
          })
          .execute();

        const items = [];
        for (const itemMongoID of playlist.media) {
          const itemID = randomUUID();
          playlistItemIDs.set(itemMongoID.toString(), itemID);

          const item = await models.PlaylistItem.findById(itemMongoID).lean();
          const mediaID = mediaIDs.get(item.media.toString());

          await tx.insertInto('playlistItems')
            .values({
              id: itemID,
              playlistID,
              mediaID,
              artist: item.artist,
              title: item.title,
              start: item.start,
              end: item.end ?? 0, // Not ideal, but what can we do
              createdAt: (item.createdAt ?? item.updatedAt ?? new Date()).toISOString(),
              updatedAt: (item.updatedAt ?? new Date()).toISOString(),
            })
            .execute();

          items.push(itemID);
        }

        await tx.updateTable('playlists')
          .where('id', '=', playlistID)
          .set({ items: jsonb(items) })
          .execute();
      }

      if (user.activePlaylist != null) {
        const activePlaylistID = playlistIDs.get(user.activePlaylist.toString());
        if (activePlaylistID != null) {
          await tx.updateTable('users')
            .where('id', '=', userID)
            .set({ activePlaylistID })
            .execute();
        }
      }
    }

    for await (const entry of models.Authentication.find().lean()) {
      const userID = userIDs.get(entry.user.toString());
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
      const userID = userIDs.get(entry.user.toString());
      const mediaID = mediaIDs.get(entry.media.media.toString());
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
          userID: userIDs.get(id.toString()),
          vote: 1,
        });
      }
      for (const id of entry.downvotes) {
        feedback.set(id.toString(), {
          historyEntryID: entryID,
          userID: userIDs.get(id.toString()),
          vote: -1,
        });
      }
      for (const id of entry.favorites) {
        const entry = feedback.get(id.toString());
        if (entry != null) {
          entry.favorite = 1;
        } else {
          feedback.set(id.toString(), {
            historyEntryID: entryID,
            userID: userIDs.get(id.toString()),
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
