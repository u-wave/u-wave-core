import { HTTPError } from '../errors/index.js';

const MONGO_DUPLICATE_KEY_ERROR = 11000;
const MONGO_DUPLICATE_KEY_ERROR2 = 11001;

/**
 * @param {Error | import('mongodb').MongoError} error
 * @returns {boolean}
 */
function isDuplicateKeyError(error) {
  return 'code' in error && (
    error.code === MONGO_DUPLICATE_KEY_ERROR
    || error.code === MONGO_DUPLICATE_KEY_ERROR2
  );
}

/**
 * Turn duplicate key errors from Mongo into useful-for-humans error messages.
 *
 * @param {Error} error Error instance that may be a duplicate key error.
 * @returns {Error} More useful error if a MongoDB duplicate key error was given,
 *    otherwise the given error, unchanged.
 */
function beautifyDuplicateKeyError(error) {
  if (isDuplicateKeyError(error)) {
    if (error.message.indexOf('username') !== -1) {
      return new HTTPError(400, 'That username is in use.');
    }
    if (error.message.indexOf('email') !== -1) {
      return new HTTPError(400, 'That email address is in use.');
    }
  }
  return error;
}

export default beautifyDuplicateKeyError;
