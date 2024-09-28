import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * @typedef {object} LeanConfig
 * @prop {string} _id
 * @typedef {mongoose.Document<LeanConfig["_id"], {}, LeanConfig> &
 *           LeanConfig} Config
 */

/**
 * @type {mongoose.Schema<Config, mongoose.Model<Config>>}
 */
const schema = new Schema({
  _id: { type: String },
}, {
  collection: 'config_store',
  strict: false,
  toJSON: { versionKey: false },
});

export default schema;
