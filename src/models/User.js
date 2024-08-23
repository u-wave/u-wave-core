import mongoose from 'mongoose';
import { slugify } from 'transliteration';

const { Schema } = mongoose;
const { Types } = mongoose.Schema;

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
 *
 * @typedef {mongoose.Document<LeanUser["_id"], {}, LeanUser> & LeanUser} User
 */

const bannedSchema = new Schema({
  moderator: { type: Types.ObjectId, ref: 'User', index: true },
  duration: { type: Number, required: true },
  expiresAt: { type: Date, required: true, index: true },
  reason: { type: String, default: '' },
});

/**
 * @type {mongoose.Schema<User, mongoose.Model<User, {}, {}>, {}>}
 */
const userSchema = new Schema({
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

userSchema.pre('validate', function preValidate(next) {
  this.slug = slugify(this.username);
  next();
});

export default userSchema;
