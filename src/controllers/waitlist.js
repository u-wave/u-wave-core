import toItemResponse from '../utils/toItemResponse.js';
import toListResponse from '../utils/toListResponse.js';

/**
 * @typedef {import('../schema.js').UserID} UserID
 */

/**
 * @type {import('../types.js').Controller}
 */
async function getWaitlist(req) {
  const { waitlist } = req.uwave;

  const list = await waitlist.getUserIDs();

  return toListResponse(list, { url: req.fullUrl });
}

/**
 * @typedef {object} AddToWaitlistBody
 * @prop {UserID} userID
 */

/**
 * POST waitlist/ entry point: used both for joining the waitlist, and for
 * adding someone else to the waitlist.
 *
 * @type {import('../types.js').AuthenticatedController<{}, {}, AddToWaitlistBody>}
 */
async function addToWaitlist(req) {
  const { user: moderator } = req;
  const { userID } = req.body;
  const { waitlist } = req.uwave;

  await waitlist.addUser(userID, { moderator });

  const updated = await waitlist.getUserIDs();

  return toListResponse(updated, { url: req.fullUrl });
}

/**
 * @typedef {object} MoveWaitlistBody
 * @prop {UserID} userID
 * @prop {number} position
 */

/**
 * @type {import('../types.js').AuthenticatedController<{}, {}, MoveWaitlistBody>}
 */
async function moveWaitlist(req) {
  const { user: moderator } = req;
  const { userID, position } = req.body;
  const { waitlist } = req.uwave;

  await waitlist.moveUser(userID, position, { moderator });

  const updated = await waitlist.getUserIDs();

  return toListResponse(updated, { url: req.fullUrl });
}

/**
 * @typedef {object} RemoveFromWaitlistParams
 * @prop {UserID} id
 */

/**
 * @type {import('../types.js').AuthenticatedController<RemoveFromWaitlistParams>}
 */
async function removeFromWaitlist(req) {
  const { user: moderator } = req;
  const { id: userID } = req.params;
  const { waitlist } = req.uwave;

  await waitlist.removeUser(userID, { moderator });

  const updated = await waitlist.getUserIDs();

  return toListResponse(updated, { url: req.fullUrl });
}

/**
 * @type {import('../types.js').AuthenticatedController}
 */
async function clearWaitlist(req) {
  const { user: moderator } = req;
  const { waitlist } = req.uwave;

  await waitlist.clear({ moderator });

  const updated = await waitlist.getUserIDs();

  return toListResponse(updated, { url: req.fullUrl });
}

/**
 * @typedef {object} LockWaitlistBody
 * @prop {boolean} lock
 */

/**
 * @type {import('../types.js').AuthenticatedController<{}, {}, LockWaitlistBody>}
 */
async function lockWaitlist(req) {
  const { user: moderator } = req;
  const { lock } = req.body;
  const { waitlist } = req.uwave;

  if (lock) {
    await waitlist.lock({ moderator });
  } else {
    await waitlist.unlock({ moderator });
  }

  return toItemResponse({ locked: lock }, { url: req.fullUrl });
}

export {
  getWaitlist,
  addToWaitlist,
  moveWaitlist,
  removeFromWaitlist,
  clearWaitlist,
  lockWaitlist,
};
