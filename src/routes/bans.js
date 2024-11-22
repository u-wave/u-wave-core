import { Router } from 'express';
import route from '../route.js';
import protect from '../middleware/protect.js';
import * as controller from '../controllers/bans.js';
import { Permissions } from '../plugins/acl.js';

function banRoutes() {
  return Router()
    .get(
      '/',
      protect(Permissions.BanList),
      route(controller.getBans),
    )

    .post(
      '/',
      protect(Permissions.BanAdd),
      route(controller.addBan),
    )

    .delete(
      '/:userID',
      protect(Permissions.BanRemove),
      route(controller.removeBan),
    );
}

export default banRoutes;
