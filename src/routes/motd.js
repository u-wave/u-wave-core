import { Router } from 'express';
import route from '../route.js';
import * as validations from '../validations.js';
import protect from '../middleware/protect.js';
import schema from '../middleware/schema.js';
import * as controller from '../controllers/motd.js';
import { Permissions } from '../plugins/acl.js';

function motdRoutes() {
  return Router()
    // GET /motd/ - Get the message of the day.
    .get(
      '/',
      route(controller.getMotd),
    )
    // PUT /motd/ - Set the message of the day.
    .put(
      '/',
      protect(Permissions.MotdSet),
      schema(validations.setMotd),
      route(controller.setMotd),
    );
}

export default motdRoutes;
