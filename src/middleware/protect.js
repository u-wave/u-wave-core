import { LoginRequiredError, PermissionError } from '../errors/index.js';
import wrapMiddleware from '../utils/wrapMiddleware.js';

/**
 * @param {import('../schema.js').Permission} [permission]
 */
function protect(permission) {
  return wrapMiddleware(async (req) => {
    const { acl } = req.uwave;

    if (!req.user) {
      throw new LoginRequiredError();
    }
    if (permission && !(await acl.isAllowed(req.user, permission))) {
      throw new PermissionError({ requiredRole: permission });
    }
  });
}

export default protect;
