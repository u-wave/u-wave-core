'use strict';

const { sql } = require('kysely');

const now = sql`(strftime('%FT%T', 'now'))`;
const emptyArray = sql`(jsonb('[]'))`;

/**
 * @param {import('umzug').MigrationParams<import('../Uwave').default>} params
 */
async function up({ context: uw }) {
  const { db } = uw;

  await db.schema.createTable('configuration')
    .addColumn('name', 'text', (col) => col.primaryKey())
    .addColumn('value', 'jsonb')
    .execute();

  await db.schema.createTable('media')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('source_type', 'text', (col) => col.notNull())
    .addColumn('source_id', 'text', (col) => col.notNull())
    .addColumn('source_data', 'jsonb')
    .addColumn('artist', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('duration', 'integer', (col) => col.notNull())
    .addColumn('thumbnail', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(now))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(now))
    .addUniqueConstraint('media_source_key', ['source_type', 'source_id'])
    .execute();

  await db.schema.createTable('users')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('username', 'text', (col) => col.notNull().unique())
    .addColumn('email', 'text')
    .addColumn('password', 'text')
    .addColumn('slug', 'text', (col) => col.notNull().unique())
    .addColumn('avatar', 'text')
    .addColumn('pending_activation', 'boolean', (col) => col.defaultTo(null))
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(now))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(now))
    .addUniqueConstraint('user_email', ['email'])
    .execute();

  await db.schema.createTable('roles')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('permissions', 'jsonb', (col) => col.notNull())
    .execute();

  await db.schema.createTable('user_roles')
    .addColumn('userID', 'uuid', (col) => col.references('users.id'))
    .addColumn('role', 'text', (col) => col.references('roles.id'))
    .addUniqueConstraint('unique_user_role', ['userID', 'role'])
    .execute();

  await db.schema.createTable('bans')
    .addColumn('user_id', 'uuid', (col) => col.primaryKey().references('users.id'))
    .addColumn('moderator_id', 'uuid', (col) => col.notNull().references('users.id'))
    .addColumn('expires_at', 'timestamp')
    .addColumn('reason', 'text')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(now))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(now))
    .execute();

  await db.schema.createTable('mutes')
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id'))
    .addColumn('moderator_id', 'uuid', (col) => col.notNull().references('users.id'))
    .addColumn('expires_at', 'timestamp', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(now))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(now))
    .execute();

  await db.schema.createTable('auth_services')
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id'))
    .addColumn('service', 'text', (col) => col.notNull())
    .addColumn('service_id', 'text', (col) => col.notNull())
    .addColumn('service_avatar', 'text')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(now))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(now))
    .addUniqueConstraint('user_auth_service', ['user_id', 'service'])
    .addUniqueConstraint('auth_service', ['service', 'service_id'])
    .execute();

  await db.schema.createTable('playlists')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id'))
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(now))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(now))
    .addColumn('items', 'jsonb', (col) => col.notNull().defaultTo(emptyArray))
    .execute();

  await db.schema.createTable('playlist_items')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('playlist_id', 'uuid', (col) => col.notNull().references('playlists.id'))
    .addColumn('media_id', 'uuid', (col) => col.notNull().references('media.id'))
    .addColumn('artist', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('start', 'integer', (col) => col.notNull())
    .addColumn('end', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(now))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(now))
    .execute();

  await db.schema.createTable('history_entries')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id'))
    .addColumn('media_id', 'uuid', (col) => col.notNull().references('media.id'))
    .addColumn('artist', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('start', 'integer', (col) => col.notNull())
    .addColumn('end', 'integer', (col) => col.notNull())
    .addColumn('source_data', 'jsonb')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(now))
    .execute();

  await db.schema.createTable('feedback')
    .addColumn('history_entry_id', 'uuid', (col) => col.notNull().references('historyEntries.id'))
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id'))
    .addColumn('vote', 'integer', (col) => col.defaultTo(0))
    .addColumn('favorite', 'integer', (col) => col.defaultTo(0))
    .addUniqueConstraint('one_vote_per_user', ['history_entry_id', 'user_id'])
    .execute();

  await db.schema.alterTable('users')
    .addColumn('active_playlist_id', 'uuid', (col) => col.references('playlists.id'))
    .execute();
}

/**
 * @param {import('umzug').MigrationParams<import('../Uwave').default>} params
 */
async function down() {}

module.exports = { up, down };
