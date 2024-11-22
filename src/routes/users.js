import { Router } from 'express';
import route from '../route.js';
import * as validations from '../validations.js';
import protect from '../middleware/protect.js';
import schema from '../middleware/schema.js';
import rateLimit from '../middleware/rateLimit.js';
import * as controller from '../controllers/users.js';
import { NameChangeRateLimitError } from '../errors/index.js';
import { Permissions } from '../plugins/acl.js';

function userRoutes() {
  return Router()
    // GET /users/ - List user accounts.
    .get(
      '/',
      protect(Permissions.UserList),
      route(controller.getUsers),
    )
    // GET /users/:id - Show a single user.
    .get(
      '/:id',
      schema(validations.getUser),
      route(controller.getUser),
    )
    // POST /users/:id/mute - Mute a user in the chat.
    // TODO move this to /mutes/ namespace.
    .post(
      '/:id/mute',
      protect(Permissions.ChatMute),
      schema(validations.muteUser),
      route(controller.muteUser),
    )
    // DELETE /users/:id/mute - Unmute a user in the chat.
    // TODO move this to /mutes/ namespace.
    .delete(
      '/:id/mute',
      protect(Permissions.ChatUnmute),
      schema(validations.unmuteUser),
      route(controller.unmuteUser),
    )
    // GET /users/:id/roles - List the roles that a user has.
    .get(
      '/:id/roles',
      route(controller.getUserRoles),
    )
    // PUT /users/:id/roles/:role - Grant a role to a user.
    .put(
      '/:id/roles/:role',
      protect(),
      schema(validations.addUserRole),
      route(controller.addUserRole),
    )
    // DELETE /users/:id/roles/:role - Remove a role from a user.
    .delete(
      '/:id/roles/:role',
      protect(),
      schema(validations.removeUserRole),
      route(controller.removeUserRole),
    )
    // PUT /users/:id/username - Change a user's username.
    .put(
      '/:id/username',
      schema(validations.setUserName),
      rateLimit('change-username', {
        max: 5,
        duration: 60 * 60 * 1000,
        error: NameChangeRateLimitError,
      }),
      route(controller.changeUsername),
    )
    // PUT /users/:id/avatar - Change a user's username.
    .put(
      '/:id/avatar',
      protect(),
      schema(validations.setUserAvatar),
      route(controller.changeAvatar),
    )
    // GET /users/:id/history - Show recent plays by a user.
    .get(
      '/:id/history',
      schema(validations.getUserHistory),
      route(controller.getHistory),
    );
}

export default userRoutes;
