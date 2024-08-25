import defaultRoles from '../config/defaultRoles.js';
import routes from '../routes/acl.js';
import { jsonb, jsonEach } from '../utils/sqlite.js';

/**
 * @typedef {import('../schema.js').User} User
 * @typedef {import('../schema.js').Permission} Permission
 */

/** @param {string} input */
function p(input) {
  return /** @type {Permission} */ (input);
}
export const Permissions = {
  Super: p('*'),
  WaitlistJoin: p('waitlist.join'),
  WaitlistJoinLocked: p('waitlist.join.locked'),
  WaitlistLeave: p('waitlist.leave'),
  WaitlistClear: p('waitlist.clear'),
  WaitlistLock: p('waitlist.lock'),
  WaitlistAdd: p('waitlist.add'),
  WaitlistMove: p('waitlist.move'),
  WaitlistRemove: p('waitlist.remove'),
  SkipSelf: p('booth.skip.self'),
  SkipOther: p('booth.skip.other'),
  Vote: p('booth.vote'),
  AclCreate: p('acl.create'),
  AclDelete: p('acl.delete'),
  ChatSend: p('chat.send'),
  ChatDelete: p('chat.delete'),
  ChatMute: p('chat.mute'),
  ChatUnmute: p('chat.unmute'),
  /** @param {string} role */
  ChatMention: (role) => p(`chat.mention.${role}`),
  UserList: p('users.list'),
  BanList: p('users.bans.list'),
  BanAdd: p('users.bans.add'),
  BanRemove: p('users.bans.remove'),
};

class Acl {
  #uw;

  #logger;

  /**
   * @param {import('../Uwave.js').default} uw
   */
  constructor(uw) {
    this.#uw = uw;
    this.#logger = uw.logger.child({ ns: 'uwave:acl' });
  }

  async maybeAddDefaultRoles() {
    const { db } = this.#uw;

    const { existingRoles } = await db.selectFrom('roles')
      .select((eb) => eb.fn.countAll().as('existingRoles'))
      .executeTakeFirstOrThrow();
    this.#logger.debug({ roles: existingRoles }, 'existing roles');
    if (existingRoles === 0) {
      this.#logger.info('no roles found, adding defaults');
      for (const [roleName, permissions] of Object.entries(defaultRoles)) {
        // eslint-disable-next-line no-await-in-loop
        await this.createRole(roleName, permissions);
      }
    }
  }

  /**
   * @returns {Promise<Record<string, Permission[]>>}
   */
  async getAllRoles() {
    const { db } = this.#uw;

    const list = await db.selectFrom('roles').selectAll().execute();

    const roles = Object.fromEntries(list.map((role) => [
      role.id,
      role.permissions,
    ]));

    return roles;
  }

  /**
   * @param {string} name
   * @param {Permission[]} permissions
   */
  async createRole(name, permissions) {
    const { db } = this.#uw;

    await db.insertInto('roles')
      .values({ id: name, permissions: jsonb(permissions) })
      .execute();

    return { name, permissions };
  }

  /**
   * @param {string} name
   */
  async deleteRole(name) {
    const { db } = this.#uw;

    await db.deleteFrom('userRoles')
      .where('role', '=', name)
      .execute();
    await db.deleteFrom('roles')
      .where('id', '=', name)
      .execute();
  }

  /**
   * @param {User} user
   * @param {string[]} roleNames
   * @returns {Promise<void>}
   */
  async allow(user, roleNames) {
    const { db } = this.#uw;

    const insertedRoles = await db.insertInto('userRoles')
      .values(roleNames.map((roleName) => ({
        userID: user.id,
        role: roleName,
      })))
      .returningAll()
      .execute();

    this.#uw.publish('acl:allow', {
      userID: user.id,
      roles: insertedRoles.map((row) => row.role),
    });
  }

  /**
   * @param {User} user
   * @param {string[]} roleNames
   * @returns {Promise<void>}
   */
  async disallow(user, roleNames) {
    const { db } = this.#uw;

    const deletedRoles = await db.deleteFrom('userRoles')
      .where('userID', '=', user.id)
      .where('role', 'in', roleNames)
      .returningAll()
      .execute();

    this.#uw.publish('acl:disallow', {
      userID: user.id,
      roles: deletedRoles.map((row) => row.role),
    });
  }

  /**
   * @param {User} user
   * @returns {Promise<Permission[]>}
   */
  async getAllPermissions(user) {
    const { db } = this.#uw;

    const permissions = await db.selectFrom('userRoles')
      .where('userID', '=', user.id)
      .innerJoin('roles', 'id', 'userRoles.role')
      .innerJoin(
        (eb) => jsonEach(eb.ref('roles.permissions')).as('permissions'),
        (join) => join,
      )
      .select('permissions.value')
      .execute();

    return permissions.map((perm) => perm.value);
  }

  /**
   * @param {User} user
   * @param {Permission} permission
   * @returns {Promise<boolean>}
   */
  async isAllowed(user, permission) {
    const permissions = await this.getAllPermissions(user);
    const isAllowed = permissions.includes(permission) || permissions.includes(Permissions.Super);

    this.#logger.trace({
      userId: user.id,
      permissions,
      isAllowed,
    }, 'user allowed check');

    return isAllowed;
  }
}

/**
 * @param {import('../Uwave.js').Boot} uw
 */
async function acl(uw) {
  uw.acl = new Acl(uw);
  uw.httpApi.use('/roles', routes());

  uw.after(async () => {
    await uw.acl.maybeAddDefaultRoles();
  });
}

export default acl;
export { Acl };
