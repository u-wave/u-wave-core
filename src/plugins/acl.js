import defaultRoles from '../config/defaultRoles.js';
import routes from '../routes/acl.js';

/**
 * @typedef {import('../models/index.js').AclRole} AclRole
 * @typedef {import('../schema.js').User} User
 * @typedef {{ roles: AclRole[] }} PopulateRoles
 * @typedef {Omit<AclRole, 'roles'> & PopulateRoles} PopulatedAclRole
 */

/**
 * @param {AclRole|string} role
 * @returns {string}
 */
function getRoleName(role) {
  return typeof role === 'string' ? role : role.id;
}

const SUPER_ROLE = '*';

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
    const { AclRole } = this.#uw.models;

    const existingRoles = await AclRole.estimatedDocumentCount();
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
   * @param {string[]} names
   * @param {{ create?: boolean }} [options]
   * @returns {Promise<AclRole[]>}
   * @private
   */
  async getAclRoles(names, options = {}) {
    const { AclRole } = this.#uw.models;

    /** @type {AclRole[]} */
    const existingRoles = await AclRole.find({ _id: { $in: names } });
    const newNames = names.filter((name) => (
      !existingRoles.some((role) => role.id === name)
    ));
    if (options.create && newNames.length > 0) {
      const newRoles = await AclRole.create(newNames.map((name) => ({ _id: name })));
      existingRoles.push(...newRoles);
    }
    return existingRoles;
  }

  /**
   * @returns {Promise<Record<string, string[]>>}
   */
  async getAllRoles() {
    const { AclRole } = this.#uw.models;

    /** @type {AclRole[]} */
    const roles = await AclRole.find().lean();
    return roles.reduce((map, role) => Object.assign(map, {
      [role._id]: role.roles,
    }), {});
  }

  /**
   * @param {string[]} roleNames
   * @returns {Promise<string[]>}
   * @private
   */
  async getSubRoles(roleNames) {
    const { AclRole } = this.#uw.models;
    // Always returns 1 document.
    /** @type {{ _id: 1, roles: string[] }[]} */
    const res = await AclRole.aggregate([
      {
        $match: {
          _id: { $in: roleNames },
        },
      },
      // Create a starting document of shape: {_id: 1, roles: roleNames}
      // This way we can get a result document that has both our initial
      // role names AND all subroles.
      {
        $group: {
          _id: 1,
          roles: { $addToSet: '$_id' },
        },
      },
      {
        $graphLookup: {
          from: 'acl_roles',
          startWith: '$roles',
          connectFromField: 'roles',
          connectToField: '_id',
          as: 'roles',
        },
      },
      { $project: { roles: '$roles._id' } },
    ]);
    return res.length === 1 ? res[0].roles.sort() : [];
  }

  /**
   * @param {string} name
   * @param {string[]} permissions
   */
  async createRole(name, permissions) {
    const { AclRole } = this.#uw.models;

    const roles = await this.getAclRoles(permissions, { create: true });
    await AclRole.findByIdAndUpdate(
      name,
      { roles: roles.map((role) => role._id) },
      { upsert: true },
    );

    // We have to fetch the permissions from the database to account for permissions
    // that have sub-permissions of their own.
    const allPermissions = await this.getSubRoles(roles.map(getRoleName));
    return {
      name,
      permissions: allPermissions,
    };
  }

  /**
   * @param {string} name
   */
  async deleteRole(name) {
    const { AclRole } = this.#uw.models;

    await AclRole.deleteOne({ _id: name });
  }

  /**
   * @param {User} user
   * @param {string[]} roleNames
   * @returns {Promise<void>}
   */
  async allow(user, roleNames) {
    const aclRoles = await this.getAclRoles(roleNames);

    aclRoles.forEach((role) => {
      user.roles.push(role.id);
    });

    await user.save();

    this.#uw.publish('acl:allow', {
      userID: user.id,
      roles: aclRoles.map((role) => role.id),
    });
  }

  /**
   * @param {User} user
   * @param {string[]} roleNames
   * @returns {Promise<void>}
   */
  async disallow(user, roleNames) {
    const aclRoles = await this.getAclRoles(roleNames);
    /** @type {(roleName: string) => boolean} */
    const shouldRemove = (roleName) => aclRoles.some((remove) => remove.id === roleName);
    user.roles = user.roles.filter((role) => !shouldRemove(getRoleName(role)));
    await user.save();

    this.#uw.publish('acl:disallow', {
      userID: user.id,
      roles: aclRoles.map((role) => role.id),
    });
  }

  /**
   * @param {User} user
   * @returns {Promise<string[]>}
   */
  async getAllPermissions(user) {
    const roles = await this.getSubRoles(user.roles.map(getRoleName));
    return roles;
  }

  /**
   * @param {User} user
   * @param {string} permission
   * @returns {Promise<boolean>}
   */
  async isAllowed(user, permission) {
    const { AclRole } = this.#uw.models;

    const role = await AclRole.findById(permission);
    if (!role) {
      return false;
    }

    const userRoles = await this.getSubRoles(user.roles.map(getRoleName));
    const isAllowed = userRoles.includes(role.id) || userRoles.includes(SUPER_ROLE);

    this.#logger.trace({
      userId: user.id,
      roleId: role.id,
      userRoles,
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
