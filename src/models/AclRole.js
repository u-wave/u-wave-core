import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * @typedef {object} LeanAclRole
 * @prop {string} _id
 * @prop {string[]} roles
 * @typedef {mongoose.Document<LeanAclRole["_id"], {}, LeanAclRole> & LeanAclRole} AclRole
 */

/**
 * @type {mongoose.Schema<AclRole, mongoose.Model<AclRole>>}
 */
const schema = new Schema({
  _id: String,
  roles: [{ type: String, ref: 'AclRole', index: true }],
}, {
  collection: 'acl_roles',
  minimize: true,
});

export default schema;
