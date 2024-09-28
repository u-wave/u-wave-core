import mongoose from 'mongoose';

const { Schema } = mongoose;
const { Types } = mongoose.Schema;

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
const schema = new Schema({
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

schema.virtual('size').get(/** @this {Playlist} */ function size() {
  return this.media.length;
});

export default schema;
