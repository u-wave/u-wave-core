'use strict';

const { Router } = require('express');
const route = require('../route');
const validations = require('../validations');
const protect = require('../middleware/protect');
const schema = require('../middleware/schema');
const controller = require('../controllers/chat');

function chatRoutes() {
  return Router()
    // POST / - Send a chat message.
    .post(
      '/',
      protect('chat.send'),
      schema(validations.sendChatMessage),
      route(controller.sendMessage),
    )
    // DELETE /chat/ - Clear the chat (delete all messages).
    .delete(
      '/',
      protect('chat.delete'),
      route(controller.deleteAll),
    )
    // DELETE /chat/user/:id - Delete all messages by a user.
    .delete(
      '/user/:id',
      protect('chat.delete'),
      schema(validations.deleteChatByUser),
      route(controller.deleteByUser),
    )
    // DELETE /chat/:id - Delete a chat message.
    .delete(
      '/:id',
      protect('chat.delete'),
      schema(validations.deleteChatMessage),
      route(controller.deleteMessage),
    );
}

module.exports = chatRoutes;
