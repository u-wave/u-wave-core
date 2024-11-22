import { Router } from 'express';
import route from '../route.js';
import * as validations from '../validations.js';
import protect from '../middleware/protect.js';
import requireActiveConnection from '../middleware/requireActiveConnection.js';
import schema from '../middleware/schema.js';
import * as controller from '../controllers/waitlist.js';
import { Permissions } from '../plugins/acl.js';

function waitlistRoutes() {
  return Router()
    // GET /waitlist/ - List users in the waitlist.
    .get(
      '/',
      route(controller.getWaitlist),
    )
    // POST /waitlist/ - Add a user to the waitlist.
    .post(
      '/',
      protect(Permissions.WaitlistJoin),
      requireActiveConnection(),
      schema(validations.joinWaitlist),
      route(controller.addToWaitlist),
    )
    // DELETE /waitlist/ - Clear the waitlist.
    .delete(
      '/',
      protect(Permissions.WaitlistClear),
      route(controller.clearWaitlist),
    )
    // PUT /waitlist/move - Move a user to a different position in the waitlist.
    .put(
      '/move',
      protect(Permissions.WaitlistMove),
      schema(validations.moveWaitlist),
      route(controller.moveWaitlist),
    )
    // DELETE /waitlist/:id - Remove a user from the waitlist.
    .delete(
      '/:id',
      protect(Permissions.WaitlistLeave),
      route(controller.removeFromWaitlist),
    )
    // PUT /waitlist/lock - Lock or unlock the waitlist.
    .put(
      '/lock',
      protect(Permissions.WaitlistLock),
      schema(validations.lockWaitlist),
      route(controller.lockWaitlist),
    );
}

export default waitlistRoutes;
