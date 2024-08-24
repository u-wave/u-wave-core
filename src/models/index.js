import aclRoleSchema from './AclRole.js';
import authenticationSchema from './Authentication.js';
import configSchema from './Config.js';
import historySchema from './History.js';
import mediaSchema from './Media.js';
import migrationSchema from './Migration.js';
import playlistSchema from './Playlist.js';
import playlistItemSchema from './PlaylistItem.js';
import userSchema from './User.js';

/**
 * @typedef {import('./AclRole.js').AclRole} AclRole
 * @typedef {import('./Authentication.js').Authentication} Authentication
 * @typedef {import('./Config.js').Config} Config
 * @typedef {import('./History.js').HistoryEntry} HistoryEntry
 * @typedef {import('./Media.js').Media} Media
 * @typedef {import('./Migration.js').Migration} Migration
 * @typedef {import('./Playlist.js').Playlist} Playlist
 * @typedef {import('./PlaylistItem.js').PlaylistItem} PlaylistItem
 * @typedef {import('./User.js').User} User
 * @typedef {{
 *  AclRole: import('mongoose').Model<AclRole, {}, {}>,
 *  Authentication: import('mongoose').Model<Authentication, {}, {}>,
 *  Config: import('mongoose').Model<Config, {}, {}>,
 *  HistoryEntry: import('mongoose').Model<HistoryEntry, {}, {}>,
 *  Media: import('mongoose').Model<Media, {}, {}>,
 *  Migration: import('mongoose').Model<Migration, {}, {}>,
 *  Playlist: import('mongoose').Model<Playlist, {}, {}>,
 *  PlaylistItem: import('mongoose').Model<PlaylistItem, {}, {}>,
 *  User: import('mongoose').Model<User, {}, {}>,
 * }} Models
 */

/**
 * @param {import('../Uwave.js').default} uw
 */
async function models(uw) {
  uw.models = {
    AclRole: uw.mongo.model('AclRole', aclRoleSchema),
    Authentication: uw.mongo.model('Authentication', authenticationSchema),
    Config: uw.mongo.model('Config', configSchema),
    HistoryEntry: uw.mongo.model('History', historySchema),
    Media: uw.mongo.model('Media', mediaSchema),
    Migration: uw.mongo.model('Migration', migrationSchema),
    Playlist: uw.mongo.model('Playlist', playlistSchema),
    PlaylistItem: uw.mongo.model('PlaylistItem', playlistItemSchema),
    User: uw.mongo.model('User', userSchema),
  };
}

export default models;
