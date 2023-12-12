import lodash from 'lodash';
import bcrypt from 'bcryptjs';
import Page from '../Page.js';
import { IncorrectPasswordError, UserNotFoundError } from '../errors/index.js';
import { slugify } from 'transliteration';

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

    let baseQuery = db.selectFrom('users');
    if (filter != null) {
      baseQuery = baseQuery.where('username', 'like', filter);
    }

    const totalQuery = db.selectFrom('users')
      .select((eb) => eb.fn.countAll().as('count'));

    const filteredQuery = filter == null ? totalQuery : baseQuery.select((eb) => eb.fn.countAll().as('count'));

    const query = baseQuery
      .offset(offset)
      .limit(limit)
      .select(['id', 'username', 'slug', 'activePlaylistID', 'pendingActivation', 'createdAt', 'updatedAt']);

    const [
      users,
      filtered,
      total,
    ] = await Promise.all([
      query.execute(),
      filteredQuery.executeTakeFirstOrThrow(),
      totalQuery.executeTakeFirstOrThrow(),
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
   */
  async getUser(id) {
    const { db } = this.#uw;

    const user = await db.selectFrom('users')
      .where('id', '=', id)
      .select(['id', 'username', 'slug', 'activePlaylistID', 'pendingActivation', 'createdAt', 'updatedAt'])
      .executeTakeFirst();

    return user ? { ...user, roles: [] } : null;
  }

  /**
   * @typedef {object} LocalLoginOptions
   * @prop {string} email
   * @prop {string} password
   *
   * @typedef {object} SocialLoginOptions
   * @prop {import('passport').Profile} profile
   *
   * @typedef {LocalLoginOptions & { type: 'local' }} DiscriminatedLocalLoginOptions
   * @typedef {SocialLoginOptions & { type: string }} DiscriminatedSocialLoginOptions
   *
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
        'id',
        'username',
        'password',
        'slug',
        'pendingActivation',
        'createdAt',
        'updatedAt',
      ])
      .executeTakeFirst();
    if (!user) {
      throw new UserNotFoundError({ email });
    }
    return omit(user, 'password');

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
   *
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

        return pick(auth, ['id', 'username', 'slug', 'activePlaylistID', 'pendingActivation', 'createdAt', 'updatedAt']);
      } else {
        const user = await tx.insertInto('users')
          .values({
            username: username ? username.replace(/\s/g, '') : `${type}.${id}`,
            slug: slugify(username),
            pendingActivation: true, // type,
            // avatar,
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
    });

    return user;
  }

  /**
   * @param {{ username: string, email: string, password: string }} props
   * @returns {Promise<User>}
   */
  async createUser({
    username, email, password,
  }) {
    const { db } = this.#uw;

    this.#logger.info({ username, email: email.toLowerCase() }, 'create user');

    const hash = await encryptPassword(password);

    const user = await db.insertInto('users')
      .values({
        username,
        email,
        password: hash,
        slug: slugify(username),
        pendingActivation: false,
      })
      .returning([
        'id',
        'username',
        'slug',
        'activePlaylistID',
        'pendingActivation',
        'createdAt',
        'updatedAt',
      ])
      .executeTakeFirstOrThrow();

    this.#uw.publish('user:create', {
      user: user.id,
      auth: { type: 'local', email: email.toLowerCase() },
    });

    return user;
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

    const updatesFromDatabase = await db.updateTable('users')
      .where('id', '=', id)
      .set(update)
      .returning(['username'])
      .executeTakeFirst();
    if (!updatesFromDatabase) {
      throw new UserNotFoundError({ id });
    }
    Object.assign(user, updatesFromDatabase);

    // Take updated keys from the Model again,
    // as it may apply things like Unicode normalization on the values.
    Object.keys(update).forEach((key) => {
      // @ts-expect-error Infeasible to statically check properties here
      // Hopefully the caller took care
      update[key] = user[key];
    });

    this.#uw.publish('user:update', {
      userID: user.id,
      moderatorID: moderator ? moderator.id : null,
      old,
      new: update,
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
