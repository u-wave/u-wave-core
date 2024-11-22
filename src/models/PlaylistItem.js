import mongoose from 'mongoose';

const { Schema } = mongoose;
const { Types } = mongoose.Schema;

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
const schema = new Schema({
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

export default schema;
