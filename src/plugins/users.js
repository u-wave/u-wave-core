import bcrypt from 'bcryptjs';
import escapeStringRegExp from 'escape-string-regexp';
import Page from '../Page.js';
import { IncorrectPasswordError, UserNotFoundError } from '../errors/index.js';

/**
 * @typedef {import('../models/index.js').User} User
 * @typedef {import('../models/index.js').Authentication} Authentication
 */

/**
 * @param {string} password
 */
function encryptPassword(password) {
  return bcrypt.hash(password, 10);
}

/**
 * @param {User} user
 */
function getDefaultAvatar(user) {
  return `https://sigil.u-wave.net/${user.id}`;
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

    const query = db.selectFrom('users').selectAll();
    if (filter != null) {
      query.where('username', 'like', filter);
    }

    query
      .offset(offset)
      .limit(limit);

    const totalQuery = db.selectFrom('users')
      .select((eb) => eb.fn.countAll().as('count'));

    const filteredQuery = filter == null ? totalQuery : db.selectFrom('users')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('username', 'like', filter);

    const [
      users,
      filtered,
      total,
    ] = await Promise.all([
      query.execute(),
      filteredQuery.executeTakeFirstOrThrow(),
      totalQuery.executeTakeFirstOrThrow(),
    ]);

  // TODO remove
    users.forEach((user) => user.roles = [])
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
   * @param {string} id
   */
  async getUser(id) {
    const { db } = this.#uw;

    const user = await db.selectFrom('users')
      .where('id', '=', id)
      .selectAll()
      .executeTakeFirst();
  // TODO remove
    if (user) user.roles = [];

    return user;
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
    const { Authentication } = this.#uw.models;

    const auth = /** @type {any} */ (await Authentication.findOne({
      email: email.toLowerCase(),
    }).populate('user').exec());

    if (!auth || !auth.user) {
      throw new UserNotFoundError({ email });
    }

    const correct = await bcrypt.compare(password, auth.hash);
    if (!correct) {
      throw new IncorrectPasswordError();
    }

    const user = await this.#uw.db.selectFrom('users')
      .where('username', '=', auth.user.username)
      .select([
        'id',
        'username',
        'slug',
        'pendingActivation',
        'createdAt',
        'updatedAt',
      ])
      .executeTakeFirst();
    if (!user) {
      throw new UserNotFoundError({ email });
    }

    return user;
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
    return this.#uw.users.findOrCreateSocialUser(user);
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
    const { User, Authentication } = this.#uw.models;

    this.#logger.info({ type, id }, 'find or create social');

    // we need this type assertion because the `user` property actually contains
    // an ObjectId in this return value. We are definitely filling in a User object
    // below before using this variable.
    /** @type {null | (Omit<Authentication, 'user'> & { user: User })} */
    let auth = await Authentication.findOne({ type, id });
    if (auth) {
      await auth.populate('user');

      if (avatar && auth.avatar !== avatar) {
        auth.avatar = avatar;
        await auth.save();
      }
    } else {
      const user = new User({
        username: username ? username.replace(/\s/g, '') : `${type}.${id}`,
        roles: ['user'],
        pendingActivation: type,
      });
      await user.validate();

      // @ts-expect-error TS2322: the type check fails because the `user` property actually contains
      // an ObjectId in this return value. We are definitely filling in a User object below before
      // using this variable.
      auth = new Authentication({
        type,
        user,
        id,
        avatar,
        // HACK, providing a fake email so we can use `unique: true` on emails
        email: `${id}@${type}.sociallogin`,
      });

      // Just so typescript knows `auth` is not null here.
      if (!auth) throw new TypeError();

      try {
        await Promise.all([
          user.save(),
          auth.save(),
        ]);
      } catch (e) {
        if (!auth.isNew) {
          await auth.deleteOne();
        }
        await user.deleteOne();
        throw e;
      }

      this.#uw.publish('user:create', {
        user: user.id,
        auth: { type, id },
      });
    }

    return auth.user;
  }

  /**
   * @param {{ username: string, email: string, password: string }} props
   * @returns {Promise<User>}
   */
  async createUser({
    username, email, password,
  }) {
    const { User, Authentication } = this.#uw.models;

    this.#logger.info({ username, email: email.toLowerCase() }, 'create user');

    const hash = await encryptPassword(password);

    const user = new User({
      username,
      roles: ['user'],
    });
    await user.validate();

    const auth = new Authentication({
      type: 'local',
      user,
      email: email.toLowerCase(),
      hash,
    });

    try {
      await Promise.all([
        user.save(),
        auth.save(),
      ]);
      // Two-stage saving to let mongodb decide the user ID before we generate an avatar URL.
      user.avatar = getDefaultAvatar(user);
      await user.save();
    } catch (e) {
      if (!auth.isNew) {
        await auth.deleteOne();
      }
      await user.deleteOne();
      throw e;
    }

    this.#uw.publish('user:create', {
      user: user.id,
      auth: { type: 'local', email: email.toLowerCase() },
    });

    return user;
  }

  /**
   * @param {import('mongodb').ObjectId} id
   * @param {string} password
   */
  async updatePassword(id, password) {
    const { Authentication } = this.#uw.models;

    const user = await this.getUser(id);
    if (!user) throw new UserNotFoundError({ id });

    const hash = await encryptPassword(password);

    const auth = await Authentication.findOneAndUpdate({
      // TODO re enable once a migrations thing is set up so that all existing
      // records can be updated to add this.
      // type: 'local',
      user: user._id,
    }, { hash });

    if (!auth) {
      throw new UserNotFoundError({ id: user.id });
    }
  }

  /**
   * @param {import('mongodb').ObjectId|string} id
   * @param {Record<string, string>} update
   * @param {{ moderator?: User }} [options]
   */
  async updateUser(id, update = {}, options = {}) {
    const user = await this.getUser(id);
    if (!user) throw new UserNotFoundError({ id });

    this.#logger.info({ userId: user.id, update }, 'update user');

    const moderator = options && options.moderator;

    /** @type {Record<string, string>} */
    const old = {};
    Object.keys(update).forEach((key) => {
      // FIXME We should somehow make sure that the type of `key` extends `keyof LeanUser` here.
      // @ts-expect-error TS7053
      old[key] = user[key];
    });
    Object.assign(user, update);

    await user.save();

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
