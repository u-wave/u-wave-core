import { UserNotFoundError } from '../errors/index.js';
import getOffsetPagination from '../utils/getOffsetPagination.js';
import toItemResponse from '../utils/toItemResponse.js';
import toPaginatedResponse from '../utils/toPaginatedResponse.js';

/** @typedef {import('../schema').UserID} UserID */

/**
 * @typedef {object} GetBansQuery
 * @prop {string} filter
 */

/**
 * @type {import('../types.js').AuthenticatedController<{}, GetBansQuery>}
 */
async function getBans(req) {
  const { bans } = req.uwave;
  const { filter } = req.query;
  const pagination = getOffsetPagination(req.query);

  const bansList = await bans.getBans(filter, pagination);

  return toPaginatedResponse(bansList, {
    included: {
      user: ['user', 'moderator'],
    },
    baseUrl: req.fullUrl,
  });
}

/**
 * @typedef {object} AddBanBody
 * @prop {number} [duration]
 * @prop {UserID} userID
 * @prop {boolean} [permanent]
 * @prop {string} [reason]
 */

/**
 * @type {import('../types.js').AuthenticatedController<{}, {}, AddBanBody>}
 */
async function addBan(req) {
  const { user: moderator } = req;
  const { users, bans } = req.uwave;
  const {
    duration = 0,
    userID,
    permanent = false,
    reason = '',
  } = req.body;

  const user = await users.getUser(userID);
  if (!user) {
    throw new UserNotFoundError({ id: userID });
  }

  const ban = await bans.ban(user, {
    moderator,
    duration,
    permanent,
    reason,
  });

  return toItemResponse(ban, {
    url: req.fullUrl,
  });
}

/**
 * @typedef {object} RemoveBanParams
 * @prop {UserID} userID
 */

/**
 * @type {import('../types.js').AuthenticatedController<RemoveBanParams>}
 */
async function removeBan(req) {
  const { user: moderator } = req;
  const { bans } = req.uwave;
  const { userID } = req.params;

  await bans.unban(userID, { moderator });

  return toItemResponse({}, {
    url: req.fullUrl,
  });
}

export {
  getBans,
  addBan,
  removeBan,
};
