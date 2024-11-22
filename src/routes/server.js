import { Router } from 'express';
import route from '../route.js';
import protect from '../middleware/protect.js';
import * as controller from '../controllers/server.js';
import { Permissions } from '../plugins/acl.js';

function serverRoutes() {
  return Router()
    // GET /server/time - Show the current server time.
    .get(
      '/time',
      route(controller.getServerTime),
    )
    // GET /server/config
    .get(
      '/config',
      protect(Permissions.Super),
      route(controller.getAllConfig),
    )
    // GET /server/config/:key
    .get(
      '/config/:key',
      protect(Permissions.Super),
      route(controller.getConfig),
    )
    // PUT /server/config/:key
    .put(
      '/config/:key',
      protect(Permissions.Super),
      route(controller.updateConfig),
    );
}

export default serverRoutes;
