'use strict';

const { randomUUID } = require('node:crypto');
const { sql } = require('kysely');

/**
 * @param {import('umzug').MigrationParams<import('../Uwave').default>} params
 */
async function up({ context: uw }) {
  const { db } = uw;

  await db.schema.createTable('media')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('source_type', 'text', (col) => col.notNull())
    .addColumn('source_id', 'text', (col) => col.notNull())
    .addColumn('source_data', 'text', (col) => col.notNull())
    .addColumn('artist', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('duration', 'integer', (col) => col.notNull())
    .addColumn('thumbnail', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('source_key', ['source_type', 'source_id'])
    .execute();

  await db.schema.createTable('users')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('username', 'text', (col) => col.notNull().unique())
    .addColumn('slug', 'text', (col) => col.notNull().unique())
    .addColumn('active_playlist_id', 'uuid')
    .addColumn('pending_activation', 'boolean', (col) => col.defaultTo(null))
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createTable('playlists')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id'))
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createTable('playlist_items')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('playlist_id', 'uuid', (col) => col.notNull().references('playlists.id'))
    .addColumn('media_id', 'uuid', (col) => col.notNull().references('media.id'))
    .addColumn('artist', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('start', 'integer', (col) => col.notNull())
    .addColumn('end', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createTable('history_entries')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('media_id', 'uuid', (col) => col.notNull().references('media.id'))
    .addColumn('artist', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('start', 'integer', (col) => col.notNull())
    .addColumn('end', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.alterTable('users')
    .addForeignKeyConstraint('users_active_playlist', ['active_playlist_id'], 'playlists', ['id'])
    .execute();
}

/**
 * @param {import('umzug').MigrationParams<import('../Uwave').default>} params
 */
async function down() {}

module.exports = { up, down };
