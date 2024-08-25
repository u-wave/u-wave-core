import { Router } from 'express';
import route from '../route.js';
import * as validations from '../validations.js';
import protect from '../middleware/protect.js';
import schema from '../middleware/schema.js';
import * as controller from '../controllers/chat.js';
import { Permissions } from '../plugins/acl.js';

function chatRoutes() {
  return Router()
    // DELETE /chat/ - Clear the chat (delete all messages).
    .delete(
      '/',
      protect(Permissions.ChatDelete),
      route(controller.deleteAll),
    )
    // DELETE /chat/user/:id - Delete all messages by a user.
    .delete(
      '/user/:id',
      protect(Permissions.ChatDelete),
      schema(validations.deleteChatByUser),
      route(controller.deleteByUser),
    )
    // DELETE /chat/:id - Delete a chat message.
    .delete(
      '/:id',
      protect(Permissions.ChatDelete),
      schema(validations.deleteChatMessage),
      route(controller.deleteMessage),
    );
}

export default chatRoutes;
