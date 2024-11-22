/**
 * Moves the active playlist state from Redis into MongoDB.
 *
 * See https://github.com/u-wave/core/issues/401.
 */

'use strict';

// Cannot use `@type {import('umzug').MigrationFn<import('../Uwave')>}`
// due to https://github.com/microsoft/TypeScript/issues/43160

/**
 * @param {import('umzug').MigrationParams<import('../Uwave')>} params
 */
async function up() {
  // snip
}

/**
 * @param {import('umzug').MigrationParams<import('../Uwave')>} params
 */
async function down() {
  // snip
}

module.exports = { up, down };
