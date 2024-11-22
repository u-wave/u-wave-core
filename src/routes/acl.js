import { Router } from 'express';
import route from '../route.js';
import * as validations from '../validations.js';
import protect from '../middleware/protect.js';
import schema from '../middleware/schema.js';
import * as controller from '../controllers/acl.js';
import { Permissions } from '../plugins/acl.js';

function aclRoutes() {
  return Router()
    // GET /roles - List available roles.
    .get(
      '/',
      route(controller.list),
    )
    // PUT /roles/:name - Create a new role.
    .put(
      '/:name',
      protect(Permissions.AclCreate),
      schema(validations.createAclRole),
      route(controller.createRole),
    )
    // DELETE /roles/:name - Delete a new role.
    .delete(
      '/:name',
      protect(Permissions.AclDelete),
      schema(validations.deleteAclRole),
      route(controller.deleteRole),
    );
}

export default aclRoutes;
