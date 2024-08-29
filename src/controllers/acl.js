import toItemResponse from '../utils/toItemResponse.js';

/**
 * @type {import('../types.js').AuthenticatedController}
 */
async function list(req) {
  const { acl } = req.uwave;

  const roles = await acl.getAllRoles();

  return toItemResponse(roles, {
    url: req.fullUrl,
  });
}

/**
 * @typedef {object} CreateRoleParams
 * @prop {string} name
 *
 * @typedef {object} CreateRoleBody
 * @prop {string[]} permissions
 */

/**
 * @type {import('../types.js').AuthenticatedController<CreateRoleParams, {}, CreateRoleBody>}
 */
async function createRole(req, res) {
  const { name } = req.params;
  const { permissions } = req.body;
  const { acl } = req.uwave;

  const role = await acl.createRole(name, /** @type {import('../schema.js').Permission[]} */ (permissions));

  res.status(201);
  return toItemResponse(role, {
    url: req.fullUrl,
  });
}

/**
 * @type {import('../types.js').AuthenticatedController}
 */
async function deleteRole(req) {
  const { name } = req.params;
  const { acl } = req.uwave;

  await acl.deleteRole(name);

  return toItemResponse({}, {
    url: req.fullUrl,
  });
}

export {
  list,
  createRole,
  deleteRole,
};
