import { randomUUID } from 'crypto';
import lodash from 'lodash';
import { sql } from 'kysely';
import { slugify } from 'transliteration';
import bcrypt from 'bcryptjs';
import Page from '../Page.js';
import {
  IncorrectPasswordError, UsedEmailError, UsedUsernameError, UserNotFoundError,
} from '../errors/index.js';
import { fromJson, jsonGroupArray } from '../utils/sqlite.js';

const { pick, omit } = lodash;

/**
 * @typedef {import('../schema.js').User} User
 * @typedef {import('../schema.js').UserID} UserID
 */

/**
 * @param {string} password
 */
function encryptPassword(password) {
  return bcrypt.hash(password, 10);
}

/** @param {import('kysely').ExpressionBuilder<import('../schema.js').Database, 'users'>} eb */
const userRolesColumn = (eb) => eb.selectFrom('userRoles')
  .where('userRoles.userID', '=', eb.ref('users.id'))
  .select((sb) => jsonGroupArray(sb.ref('userRoles.role')).as('roles'));
/** @param {import('kysely').ExpressionBuilder<import('../schema.js').Database, 'users'>} eb */
const avatarColumn = (eb) => eb.fn.coalesce(
  'users.avatar',
  /** @type {import('kysely').RawBuilder<string>} */ (sql`concat('https://sigil.u-wave.net/', ${eb.ref('users.id')})`),
);

/**
 * Translate a SQLite error into a HTTP error explaining the problem.
 *
 * @param {unknown} err
 * @returns {never}
 */
function rethrowInsertError(err) {
  if (err instanceof Error && 'code' in err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    if (err.message.includes('users.email')) {
      throw new UsedEmailError();
    }
    if (err.message.includes('users.username') || err.message.includes('users.slug')) {
      throw new UsedUsernameError();
    }
  }
  throw err;
}

class UsersRepository {
  #uw;

  #logger;

  /**
   * @param {import('../Uwave.js').default} uw
   */
  constructor(uw) {
    this.#uw = uw;
    this.#logger = uw.logger.child({ ns: 'uwave:users' });
  }

  /**
   * @param {string} [filter]
   * @param {{ offset?: number, limit?: number }} [pagination]
   */
  async getUsers(filter, pagination = {}) {
    const { db } = this.#uw;

    const {
      offset = 0,
      limit = 50,
    } = pagination;

    let query = db.selectFrom('users')
      .select([
        'users.id',
        'users.username',
        'users.slug',
        'users.activePlaylistID',
        'users.pendingActivation',
        'users.createdAt',
        'users.updatedAt',
        (eb) => avatarColumn(eb).as('avatar'),
        (eb) => userRolesColumn(eb).as('roles'),
      ])
      .offset(offset)
      .limit(limit);
    if (filter != null) {
      query = query.where('username', 'like', `%${filter}%`);
    }

    const totalQuery = db.selectFrom('users')
      .select((eb) => eb.fn.countAll().as('count'))
      .executeTakeFirstOrThrow();

    const filteredQuery = filter == null ? totalQuery : db.selectFrom('users')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('username', 'like', `%${filter}%`)
      .executeTakeFirstOrThrow();

    const [
      users,
      filtered,
      total,
    ] = await Promise.all([
      query.execute(),
      filteredQuery,
      totalQuery,
    ]);

    return new Page(users, {
      pageSize: limit,
      filtered: Number(filtered.count),
      total: Number(total.count),
      current: { offset, limit },
      next: offset + limit <= Number(total.count) ? { offset: offset + limit, limit } : null,
      previous: offset > 0
        ? { offset: Math.max(offset - limit, 0), limit }
        : null,
    });
  }

  /**
   * Get a user object by ID.
   *
   * @param {UserID} id
   * @param {import('../schema.js').Kysely} [tx]
   */
  async getUser(id, tx) {
    const [user] = await this.getUsersByIds([id], tx);
    return user ?? null;
  }

  /**
   * @param {UserID[]} ids
   * @param {import('../schema.js').Kysely} [tx]
   */
  async getUsersByIds(ids, tx = this.#uw.db) {
    const users = await tx.selectFrom('users')
      .where('id', 'in', ids)
      .select([
        'users.id',
        'users.username',
        'users.slug',
        'users.activePlaylistID',
        'users.pendingActivation',
        'users.createdAt',
        'users.updatedAt',
        (eb) => avatarColumn(eb).as('avatar'),
        (eb) => userRolesColumn(eb).as('roles'),
      ])
      .execute();

    return users.map((user) => ({
      ...user,
      roles: user.roles != null ? fromJson(user.roles) : [],
    }));
  }

  /**
   * @typedef {object} LocalLoginOptions
   * @prop {string} email
   * @prop {string} password
   * @typedef {object} SocialLoginOptions
   * @prop {import('passport').Profile} profile
   * @typedef {LocalLoginOptions & { type: 'local' }} DiscriminatedLocalLoginOptions
   * @typedef {SocialLoginOptions & { type: string }} DiscriminatedSocialLoginOptions
   * @param {DiscriminatedLocalLoginOptions | DiscriminatedSocialLoginOptions} options
   * @returns {Promise<User>}
   */
  login({ type, ...params }) {
    if (type === 'local') {
      // @ts-expect-error TS2345: Pinky promise not to use 'local' name for custom sources
      return this.localLogin(params);
    }
    // @ts-expect-error TS2345: Pinky promise not to use 'local' name for custom sources
    return this.socialLogin(type, params);
  }

  /**
   * @param {LocalLoginOptions} options
   */
  async localLogin({ email, password }) {
    const user = await this.#uw.db.selectFrom('users')
      .where('email', '=', email)
      .select([
        'users.id',
        'users.username',
        'users.slug',
        (eb) => avatarColumn(eb).as('avatar'),
        'users.activePlaylistID',
        'users.pendingActivation',
        'users.createdAt',
        'users.updatedAt',
        'users.password',
      ])
      .executeTakeFirst();
    if (!user) {
      throw new UserNotFoundError({ email });
    }

    if (!user.password) {
      throw new IncorrectPasswordError();
    }

    const correct = await bcrypt.compare(password, user.password);
    if (!correct) {
      throw new IncorrectPasswordError();
    }

    return omit(user, 'password');
  }

  /**
   * @param {string} type
   * @param {SocialLoginOptions} options
   * @returns {Promise<User>}
   */
  async socialLogin(type, { profile }) {
    const user = {
      type,
      id: profile.id,
      username: profile.displayName,
      avatar: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : undefined,
    };
    return this.findOrCreateSocialUser(user);
  }

  /**
   * @typedef {object} FindOrCreateSocialUserOptions
   * @prop {string} type
   * @prop {string} id
   * @prop {string} username
   * @prop {string} [avatar]
   * @param {FindOrCreateSocialUserOptions} options
   * @returns {Promise<User>}
   */
  async findOrCreateSocialUser({
    type,
    id,
    username,
    avatar,
  }) {
    const { db } = this.#uw;

    this.#logger.info({ type, id }, 'find or create social');

    const user = await db.transaction().execute(async (tx) => {
      const auth = await tx.selectFrom('authServices')
        .innerJoin('users', 'users.id', 'authServices.userID')
        .where('service', '=', type)
        .where('serviceID', '=', id)
        .select([
          'authServices.service',
          'authServices.serviceID',
          'authServices.serviceAvatar',
          'users.id',
          'users.username',
          'users.slug',
          'users.activePlaylistID',
          'users.pendingActivation',
          'users.createdAt',
          'users.updatedAt',
        ])
        .executeTakeFirst();

      if (auth) {
        if (avatar && auth.serviceAvatar !== avatar) {
          auth.serviceAvatar = avatar;
        }

        return Object.assign(
          pick(auth, ['id', 'username', 'slug', 'activePlaylistID', 'pendingActivation', 'createdAt', 'updatedAt']),
          { avatar: null },
        );
      } else {
        const user = await tx.insertInto('users')
          .values({
            id: /** @type {UserID} */ (randomUUID()),
            username: username ? username.replace(/\s/g, '') : `${type}.${id}`,
            slug: slugify(username),
            pendingActivation: true,
            avatar,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        await tx.insertInto('authServices')
          .values({
            userID: user.id,
            service: type,
            serviceID: id,
            serviceAvatar: avatar,
          })
          .executeTakeFirstOrThrow();

        this.#uw.publish('user:create', {
          user: user.id,
          auth: { type, id },
        });

        return user;
      }
    }).catch(rethrowInsertError);

    return user;
  }

  /**
   * @param {{ username: string, email: string, password: string }} props
   */
  async createUser({
    username, email, password,
  }) {
    const { acl, db } = this.#uw;

    this.#logger.info({ username, email: email.toLowerCase() }, 'create user');

    const hash = await encryptPassword(password);

    const insert = db.insertInto('users')
      .values({
        id: /** @type {UserID} */ (randomUUID()),
        username,
        email,
        password: hash,
        slug: slugify(username),
        pendingActivation: /** @type {boolean} */ (/** @type {unknown} */ (0)),
      })
      .returning([
        'users.id',
        'users.username',
        'users.slug',
        (eb) => avatarColumn(eb).as('avatar'),
        'users.activePlaylistID',
        'users.pendingActivation',
        'users.createdAt',
        'users.updatedAt',
      ]);

    let user;
    try {
      user = await insert.executeTakeFirstOrThrow();
    } catch (err) {
      rethrowInsertError(err);
    }

    const roles = ['user'];
    await acl.allow(user, roles);

    this.#uw.publish('user:create', {
      user: user.id,
      auth: { type: 'local', email: email.toLowerCase() },
    });

    return Object.assign(user, { roles });
  }

  /**
   * @param {UserID} id
   * @param {string} password
   */
  async updatePassword(id, password) {
    const { db } = this.#uw;

    const hash = await encryptPassword(password);
    const result = await db.updateTable('users')
      .where('id', '=', id)
      .set({ password: hash })
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) {
      throw new UserNotFoundError({ id });
    }
  }

  /**
   * @param {UserID} id
   * @param {Partial<Pick<User, 'username'>>} update
   * @param {{ moderator?: User }} [options]
   */
  async updateUser(id, update = {}, options = {}) {
    const { db } = this.#uw;

    const user = await this.getUser(id);
    if (!user) throw new UserNotFoundError({ id });

    this.#logger.info({ userId: user.id, update }, 'update user');

    const moderator = options.moderator;

    /** @type {typeof update} */
    const old = {};
    Object.keys(update).forEach((key) => {
      // FIXME We should somehow make sure that the type of `key` extends `keyof User` here.
      // @ts-expect-error TS7053
      old[key] = user[key];
    });
    Object.assign(user, update);

    const derivedUpdates = {};
    if ('username' in update && update.username != null) {
      derivedUpdates.slug = slugify(update.username);
    }

    const updatesFromDatabase = await db.updateTable('users')
      .where('id', '=', id)
      .set({ ...update, ...derivedUpdates })
      .returning(['username', 'slug'])
      .executeTakeFirst()
      .catch(rethrowInsertError);
    if (!updatesFromDatabase) {
      throw new UserNotFoundError({ id });
    }
    Object.assign(user, updatesFromDatabase);

    this.#uw.publish('user:update', {
      userID: user.id,
      moderatorID: moderator ? moderator.id : null,
      old,
      new: updatesFromDatabase,
    });

    return user;
  }
}

/**
 * @param {import('../Uwave.js').default} uw
 */
async function usersPlugin(uw) {
  uw.users = new UsersRepository(uw);
}

export default usersPlugin;
export { UsersRepository };
