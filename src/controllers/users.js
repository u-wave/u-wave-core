import {
  HTTPError,
  PermissionError,
  UserNotFoundError,
} from '../errors/index.js';
import skipIfCurrentDJ from '../utils/skipIfCurrentDJ.js';
import removeFromWaitlist from '../utils/removeFromWaitlist.js';
import getOffsetPagination from '../utils/getOffsetPagination.js';
import toItemResponse from '../utils/toItemResponse.js';
import toListResponse from '../utils/toListResponse.js';
import toPaginatedResponse from '../utils/toPaginatedResponse.js';
import beautifyDuplicateKeyError from '../utils/beautifyDuplicateKeyError.js';
import { muteUser, unmuteUser } from './chat.js';

/**
 * @typedef {object} GetUsersQuery
 * @prop {string} filter
 */

/**
 * @type {import('../types.js').AuthenticatedController<{}, GetUsersQuery>}
 */
async function getUsers(req) {
  const { filter } = req.query;
  const pagination = getOffsetPagination(req.query, {
    defaultSize: 50,
  });
  const { users } = req.uwave;

  const userList = await users.getUsers(filter, pagination);

  return toPaginatedResponse(userList, {
    baseUrl: req.fullUrl,
  });
}

/**
 * @typedef {object} GetUserParams
 * @prop {string} id
 */

/**
 * @type {import('../types.js').Controller<GetUserParams>}
 */
async function getUser(req) {
  const { users } = req.uwave;
  const { id: userID } = req.params;

  const user = await users.getUser(userID);
  if (!user) {
    throw new UserNotFoundError({ id: userID });
  }

  return toItemResponse(user, {
    url: req.fullUrl,
  });
}

/**
 * @typedef {object} GetUserRolesParams
 * @prop {string} id
 */

/**
 * @type {import('../types.js').Controller<GetUserRolesParams>}
 */
async function getUserRoles(req) {
  const { acl, users } = req.uwave;
  const { id } = req.params;

  const user = await users.getUser(id);
  if (!user) {
    throw new UserNotFoundError({ id });
  }

  const roles = await acl.getAllPermissions(user);

  return toListResponse(roles, {
    url: req.fullUrl,
  });
}

/**
 * @typedef {object} AddUserRoleParams
 * @prop {string} id
 * @prop {string} role
 */

/**
 * @type {import('../types.js').AuthenticatedController<AddUserRoleParams>}
 */
async function addUserRole(req) {
  const { user: moderator } = req;
  const { id, role } = req.params;
  const { acl, users } = req.uwave;

  const selfHasRole = await acl.isAllowed(moderator, role);
  if (!selfHasRole) {
    throw new PermissionError({ requiredRole: role });
  }

  const user = await users.getUser(id);
  if (!user) {
    throw new UserNotFoundError({ id });
  }

  await acl.allow(user, [role]);

  return toItemResponse({}, {
    url: req.fullUrl,
  });
}

/**
 * @typedef {object} RemoveUserRoleParams
 * @prop {string} id
 * @prop {string} role
 */

/**
 * @type {import('../types.js').AuthenticatedController<RemoveUserRoleParams>}
 */
async function removeUserRole(req) {
  const { user: moderator } = req;
  const { id, role } = req.params;
  const { acl, users } = req.uwave;

  const selfHasRole = await acl.isAllowed(moderator, role);
  if (!selfHasRole) {
    throw new PermissionError({ requiredRole: role });
  }

  const user = await users.getUser(id);
  if (!user) {
    throw new UserNotFoundError({ id });
  }

  await acl.disallow(user, [role]);

  return toItemResponse({}, {
    url: req.fullUrl,
  });
}

/**
 * @typedef {object} ChangeUsernameParams
 * @prop {string} id
 *
 * @typedef {object} ChangeUsernameBody
 * @prop {string} username
 */

/**
 * @type {import('../types.js').AuthenticatedController<
 *     ChangeUsernameParams, {}, ChangeUsernameBody>}
 */
async function changeUsername(req) {
  const { user: moderator } = req;
  const { id } = req.params;
  const { username } = req.body;
  const { users } = req.uwave;

  try {
    const user = await users.updateUser(
      id,
      { username },
      { moderator },
    );

    return toItemResponse(user);
  } catch (error) {
    throw beautifyDuplicateKeyError(error);
  }
}

/**
 * @returns {Promise<import('type-fest').JsonObject>}
 */
async function changeAvatar() {
  throw new HTTPError(500, 'Not implemented');
}

/**
 * @param {import('../Uwave.js').default} uw
 * @param {import('mongodb').ObjectId} userID
 */
async function disconnectUser(uw, userID) {
  await skipIfCurrentDJ(uw, userID);

  try {
    await removeFromWaitlist(uw, userID);
  } catch {
    // Ignore
  }

  await uw.redis.lrem('users', 0, userID.toString());

  uw.publish('user:leave', { userID: userID.toString() });
}

/**
 * @typedef {object} GetHistoryParams
 * @prop {string} id
 */

/**
 * @type {import('../types.js').Controller<GetHistoryParams>}
 */
async function getHistory(req) {
  const { id } = req.params;
  const pagination = getOffsetPagination(req.query, {
    defaultSize: 25,
    maxSize: 100,
  });
  const uw = req.uwave;

  const user = await uw.users.getUser(id);
  if (!user) {
    throw new UserNotFoundError({ id });
  }

  const history = await uw.history.getUserHistory(user, pagination);

  return toPaginatedResponse(history, {
    baseUrl: req.fullUrl,
    included: {
      media: ['media.media'],
      user: ['user'],
    },
  });
}

export {
  getUsers,
  getUser,
  getUserRoles,
  addUserRole,
  removeUserRole,
  changeUsername,
  changeAvatar,
  disconnectUser,
  getHistory,
  muteUser,
  unmuteUser,
};
