import fs from 'node:fs';
import { Passport } from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { callbackify } from 'util';
import JWTStrategy from '../auth/JWTStrategy.js';

const schema = JSON.parse(
  fs.readFileSync(new URL('../schemas/socialAuth.json', import.meta.url), 'utf8'),
);

/**
 * @typedef {import('../schema.js').UserID} UserID
 * @typedef {import('../schema.js').User} User
 *
 * @typedef {{
 *   callbackURL?: string,
 * } & ({
 *   enabled: false,
 * } | {
 *   enabled: true,
 *   clientID: string,
 *   clientSecret: string,
 * })} GoogleOptions
 *
 * @typedef {object} SocialAuthSettings
 * @prop {GoogleOptions} google
 */

class PassportPlugin extends Passport {
  #uw;

  #logger;

  /**
   * @param {import('../Uwave.js').Boot} uw
   * @param {{ secret: Buffer|string }} options
   */
  constructor(uw, options) {
    super();

    this.#uw = uw;
    this.#logger = uw.logger.child({ ns: 'uwave:authentication' });

    /**
     * @param {Express.User} user
     * @returns {Promise<UserID>}
     */
    function serializeUser(user) {
      console.log('serializeUser', user);
      /** @type {UserID} */
      // @ts-expect-error `user` is actually an instance of the User model
      // but we can't express that
      const userID = user.id || user._id;
      return Promise.resolve(userID);
    }
    /**
     * @param {UserID} id
     * @returns {Promise<User|null>}
     */
    function deserializeUser(id) {
      return uw.users.getUser(id);
    }

    this.serializeUser(callbackify(serializeUser));
    this.deserializeUser(callbackify(deserializeUser));

    /**
     * @param {string} email
     * @param {string} password
     * @returns {Promise<User>}
     */
    function localLogin(email, password) {
      return uw.users.login({ type: 'local', email, password });
    }

    this.use('local', new LocalStrategy({
      usernameField: 'email',
      passwordField: 'password',
      session: false,
    }, callbackify(localLogin)));
    this.use('jwt', new JWTStrategy(options.secret, async (user) => {
      try {
        return await uw.users.getUser(user.id);
      } catch (err) {
        this.#logger.warn({ err, user }, 'could not load user from JWT');
        return null;
      }
    }));

    uw.config.register(schema['uw:key'], schema);
    const unsubscribe = uw.config.subscribe(schema['uw:key'], /** @param {SocialAuthSettings} settings */ (settings) => {
      this.applyAuthStrategies(settings);
    });
    uw.onClose(unsubscribe);
  }

  /**
   * Must be called once on boot.
   */
  async loadRuntimeConfiguration() {
    /** @type {SocialAuthSettings} */
    // @ts-expect-error TS2322 `get()` returns a validated object with default values populated
    const settings = await this.#uw.config.get(schema['uw:key']);
    try {
      this.applyAuthStrategies(settings);
    } catch (error) {
      // The schema doesn't _quite_ protect against all possible misconfiguration
      this.#logger.error({ err: error }, 'applying social auth settings failed');
    }
  }

  /**
   * @param {string} accessToken
   * @param {string} refreshToken
   * @param {import('passport').Profile} profile
   * @returns {Promise<User>}
   * @private
   */
  socialLogin(accessToken, refreshToken, profile) {
    return this.#uw.users.login({
      type: profile.provider,
      profile,
    });
  }

  /**
   * @param {string} strategy
   * @returns {boolean}
   */
  supports(strategy) {
    // @ts-expect-error TS2339: _strategy is not in the typings for passport but it does exist
    // eslint-disable-next-line no-underscore-dangle
    return this._strategy(strategy) !== undefined;
  }

  /**
   * @returns {string[]}
   */
  strategies() {
    // @ts-expect-error TS2339: _strategies is not in the typings for passport but it does exist
    // eslint-disable-next-line no-underscore-dangle
    return Object.keys(this._strategies)
      .filter((strategy) => strategy !== 'session' && strategy !== 'jwt');
  }

  /**
   * @param {SocialAuthSettings} settings
   * @private
   */
  applyAuthStrategies(settings) {
    this.#logger.info('reapplying settings');
    this.unuse('google');

    if (settings && settings.google && settings.google.enabled) {
      this.#logger.info('enable google');
      this.use('google', new GoogleStrategy({
        callbackURL: '/auth/service/google/callback',
        ...settings.google,
        scope: ['profile'],
      }, callbackify(this.socialLogin.bind(this))));
    }
  }
}

/**
 * @param {import('../Uwave.js').Boot} uw
 * @param {{ secret: Buffer|string }} options
 */
async function passportPlugin(uw, options) {
  uw.passport = new PassportPlugin(uw, options);
  await uw.passport.loadRuntimeConfiguration();
}

export default passportPlugin;
export { PassportPlugin as Passport };
