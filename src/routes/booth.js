import { Router } from 'express';
import route from '../route.js';
import * as validations from '../validations.js';
import protect from '../middleware/protect.js';
import schema from '../middleware/schema.js';
import * as controller from '../controllers/booth.js';

function boothRoutes() {
  return Router()
    // GET /booth/ - Get the current booth status.
    .get(
      '/',
      route(controller.getBooth),
    )
    // POST /booth/skip - Skip the current DJ's play.
    .post(
      '/skip',
      protect(),
      schema(validations.skipBooth),
      route(controller.skipBooth),
    )
    // PUT /booth/leave - Auto-remove the current DJ on the next advance.
    .put(
      '/leave',
      protect(),
      schema(validations.leaveBooth),
      route(controller.leaveBooth),
    )
    // POST /booth/replace - Replace the current DJ with someone else.
    .post(
      '/replace',
      protect('booth.replace'),
      schema(validations.replaceBooth),
      route(controller.replaceBooth),
    )
    // GET /booth/:historyID/vote - Get the current user's vote for the current play.
    .get(
      '/:historyID/vote',
      protect(),
      schema(validations.getVote),
      route(controller.getVote),
    )
    // PUT /booth/:historyID/vote - Upvote or downvote the current play.
    .put(
      '/:historyID/vote',
      protect(),
      schema(validations.vote),
      route(controller.vote),
    )
    // POST /booth/favorite - Add the current play to your favorites.
    .post(
      '/favorite',
      protect(),
      schema(validations.favorite),
      route(controller.favorite),
    )
    // GET /booth/history - Get recent plays.
    .get(
      '/history',
      schema(validations.getRoomHistory),
      route(controller.getHistory),
    );
}

export default boothRoutes;
