import mongoose from 'mongoose';

const { Schema } = mongoose;

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
const schema = new Schema({
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

export default schema;
