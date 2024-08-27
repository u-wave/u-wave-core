import cookie from 'cookie';
import jwt from 'jsonwebtoken';
import randomString from 'random-string';
import nodeFetch from 'node-fetch';
import ms from 'ms';
import htmlescape from 'htmlescape';
import httpErrors from 'http-errors';
import {
  BannedError,
  ReCaptchaError,
  InvalidResetTokenError,
  UserNotFoundError,
} from '../errors/index.js';
import sendEmail from '../email.js';
import beautifyDuplicateKeyError from '../utils/beautifyDuplicateKeyError.js';
import toItemResponse from '../utils/toItemResponse.js';
import toListResponse from '../utils/toListResponse.js';
import { serializeUser } from '../utils/serialize.js';

const { BadRequest } = httpErrors;

/**
 * @typedef {import('../schema').UserID} UserID
 */

/**
 * @typedef {object} AuthenticateOptions
 * @prop {string|Buffer} secret
 * @prop {string} [origin]
 * @prop {import('nodemailer').Transport} [mailTransport]
 * @prop {{ secret: string }} [recaptcha]
 * @prop {(options: { token: string, requestUrl: string }) =>
 *   import('nodemailer').SendMailOptions} createPasswordResetEmail
 * @prop {boolean} [cookieSecure]
 * @prop {string} [cookiePath]
 *
 * @typedef {object} WithAuthOptions
 * @prop {AuthenticateOptions} authOptions
 */

/**
 * @param {string} str
 */
function seconds(str) {
  return Math.floor(ms(str) / 1000);
}

/**
 * @type {import('../types.js').Controller}
 */
async function getCurrentUser(req) {
  return toItemResponse(req.user != null ? serializeUser(req.user) : null, {
    url: req.fullUrl,
  });
}

/**
 * @type {import('../types.js').Controller}
 */
async function getAuthStrategies(req) {
  const { passport } = req.uwave;

  const strategies = passport.strategies();

  return toListResponse(
    strategies,
    { url: req.fullUrl },
  );
}

/**
 * @param {import('express').Response} res
 * @param {import('../HttpApi.js').HttpApi} api
 * @param {import('../schema.js').User} user
 * @param {AuthenticateOptions & { session: 'cookie' | 'token' }} options
 */
async function refreshSession(res, api, user, options) {
  const token = jwt.sign(
    { id: user.id },
    options.secret,
    { expiresIn: '31d' },
  );

  const socketToken = await api.authRegistry.createAuthToken(user);

  if (options.session === 'cookie') {
    const serialized = cookie.serialize('uwsession', token, {
      httpOnly: true,
      secure: !!options.cookieSecure,
      path: options.cookiePath ?? '/',
      maxAge: seconds('31 days'),
    });
    res.setHeader('Set-Cookie', serialized);
    return { token: 'cookie', socketToken };
  }

  return { token, socketToken };
}

/**
 * The login controller is called once a user has logged in successfully using Passport;
 * we only have to assign the JWT.
 *
 * @typedef {object} LoginQuery
 * @prop {'cookie'|'token'} [session]
 *
 * @param {import('../types.js').AuthenticatedRequest<{}, LoginQuery, {}> & WithAuthOptions} req
 * @param {import('express').Response} res
 */
async function login(req, res) {
  const options = req.authOptions;
  const { user } = req;
  const { session } = req.query;
  const { bans } = req.uwave;

  const sessionType = session === 'cookie' ? 'cookie' : 'token';

  if (await bans.isBanned(user)) {
    throw new BannedError();
  }

  const { token, socketToken } = await refreshSession(res, req.uwaveHttp, user, {
    ...options,
    session: sessionType,
  });

  return toItemResponse(user, {
    meta: {
      jwt: sessionType === 'token' ? token : 'cookie',
      socketToken,
    },
  });
}

/**
 * @param {import('../Uwave.js').default} uw
 * @param {import('../schema.js').User} user
 * @param {string} service
 */
async function getSocialAvatar(uw, user, service) {
  const auth = await uw.db.selectFrom('authServices')
    .where('userID', '=', user.id)
    .where('service', '=', service)
    .select(['serviceAvatar'])
    .executeTakeFirst();

  return auth?.serviceAvatar ?? null;
}

/**
 * @param {string} service
 * @param {import('../types.js').AuthenticatedRequest & WithAuthOptions} req
 * @param {import('express').Response} res
 */
async function socialLoginCallback(service, req, res) {
  const { user } = req;
  const { bans, locale } = req.uwave;
  const { origin } = req.authOptions;

  if (await bans.isBanned(user)) {
    throw new BannedError();
  }

  /**
   * @type {{ pending: boolean, id?: string, type?: string, avatars?: Record<string, string> }}
   */
  let activationData = { pending: false };
  if (user.pendingActivation) {
    const socialAvatar = await getSocialAvatar(req.uwave, user, service);

    /** @type {Record<string, string>} */
    const avatars = {
      sigil: `https://sigil.u-wave.net/${user.id}`,
    };
    if (socialAvatar) {
      avatars[service] = socialAvatar;
    }
    activationData = {
      pending: true,
      id: user.id,
      avatars,
      type: service,
    };
  }

  const script = `
    var opener = window.opener;
    if (opener) {
      opener.postMessage(${htmlescape(activationData)}, ${htmlescape(origin)});
    }
    window.close();
  `;

  await refreshSession(res, req.uwaveHttp, user, {
    ...req.authOptions,
    session: 'cookie',
  });

  res.end(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${locale.t('authentication.successTitle')}</title>
      </head>
      <body style="background: #151515; color: #fff; font: 12pt 'Open Sans', sans-serif">
        ${locale.t('authentication.closeThisWindow')}
        <script>${script}</script>
      </body>
    </html>
  `);
}

/**
 * @typedef {object} SocialLoginFinishQuery
 * @prop {'cookie'|'token'} [session]
 *
 * @typedef {object} SocialLoginFinishBody
 * @prop {string} username
 * @prop {string} avatar
 */

/**
 * @param {string} service
 * @param {import('../types.js').Request<{}, SocialLoginFinishQuery, SocialLoginFinishBody> &
 *         WithAuthOptions} req
 * @param {import('express').Response} res
 */
async function socialLoginFinish(service, req, res) {
  const options = req.authOptions;
  const { pendingUser: user } = req;
  const sessionType = req.query.session === 'cookie' ? 'cookie' : 'token';
  const { db, bans } = req.uwave;

  if (!user) {
    // Should never happen so not putting much effort into
    // localising the error message.
    throw new BadRequest('This account has already been set up');
  }

  if (await bans.isBanned(user)) {
    throw new BannedError();
  }

  const { username, avatar } = req.body;

  // TODO Use the avatars plugin for this stuff later.
  let avatarUrl;
  if (avatar !== 'sigil') {
    avatarUrl = await getSocialAvatar(req.uwave, user, service);
  }
  if (!avatarUrl) {
    avatarUrl = `https://sigil.u-wave.net/${user.id}`;
  }

  const updates = await db.updateTable('users')
    .where('id', '=', user.id)
    .set({
      username,
      avatar: avatarUrl,
      pendingActivation: false,
    })
    .returning(['username', 'avatar', 'pendingActivation'])
    .executeTakeFirst();

  Object.assign(user, updates);

  const { token, socketToken } = await refreshSession(res, req.uwaveHttp, user, {
    ...options,
    session: sessionType,
  });

  return toItemResponse(user, {
    meta: {
      jwt: sessionType === 'token' ? token : 'cookie',
      socketToken,
    },
  });
}

/**
 * @type {import('../types.js').AuthenticatedController}
 */
async function getSocketToken(req) {
  const { user } = req;
  const { authRegistry } = req.uwaveHttp;

  const socketToken = await authRegistry.createAuthToken(user);

  return toItemResponse({ socketToken }, {
    url: req.fullUrl,
  });
}

/**
 * @param {string} responseString
 * @param {{ secret: string, logger?: import('pino').Logger }} options
 */
async function verifyCaptcha(responseString, options) {
  options.logger?.info('recaptcha: sending siteverify request');
  const response = await nodeFetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'post',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({
      response: responseString,
      secret: options.secret,
    }),
  });
  const body = /** @type {{ success: boolean }} */ (await response.json());

  if (!body.success) {
    options.logger?.warn(body, 'recaptcha: validation failure');
    throw new ReCaptchaError();
  } else {
    options.logger?.info('recaptcha: ok');
  }
}

/**
 * @typedef {object} RegisterBody
 * @prop {string} email
 * @prop {string} username
 * @prop {string} password
 * @prop {string} [grecaptcha]
 */

/**
 * @param {import('../types.js').Request<{}, {}, RegisterBody> & WithAuthOptions} req
 */
async function register(req) {
  const { users } = req.uwave;
  const {
    grecaptcha, email, username, password,
  } = req.body;

  try {
    const recaptchaOptions = req.authOptions.recaptcha;
    if (recaptchaOptions && recaptchaOptions.secret) {
      if (grecaptcha) {
        await verifyCaptcha(grecaptcha, {
          secret: recaptchaOptions.secret,
          logger: req.log,
        });
      } else {
        req.log.warn('missing client-side captcha response');
        throw new ReCaptchaError();
      }
    }

    const user = await users.createUser({
      email,
      username,
      password,
    });

    return toItemResponse(user);
  } catch (error) {
    throw beautifyDuplicateKeyError(error);
  }
}

/**
 * @typedef {object} RequestPasswordResetBody
 * @prop {string} email
 */

/**
 * @param {import('../types.js').Request<{}, {}, RequestPasswordResetBody> & WithAuthOptions} req
 */
async function reset(req) {
  const { db, redis } = req.uwave;
  const { email } = req.body;
  const { mailTransport, createPasswordResetEmail } = req.authOptions;

  const user = await db.selectFrom('users')
    .where('email', '=', email)
    .select(['id'])
    .executeTakeFirst();
  if (!user) {
    throw new UserNotFoundError({ email });
  }

  const token = randomString({ length: 35, special: false });

  await redis.set(`reset:${token}`, user.id);
  await redis.expire(`reset:${token}`, 24 * 60 * 60);

  const message = await createPasswordResetEmail({
    token,
    requestUrl: req.fullUrl,
  });

  await sendEmail(email, {
    mailTransport,
    email: message,
  });

  return toItemResponse({});
}

/**
 * @typedef {object} ChangePasswordParams
 * @prop {string} reset
 *
 * @typedef {object} ChangePasswordBody
 * @prop {string} password
 */

/**
 * @type {import('../types.js').Controller<ChangePasswordParams, {}, ChangePasswordBody>}
 */
async function changePassword(req) {
  const { users, redis } = req.uwave;
  const { reset: resetToken } = req.params;
  const { password } = req.body;

  const userID = /** @type {UserID} */ (await redis.get(`reset:${resetToken}`));
  if (!userID) {
    throw new InvalidResetTokenError();
  }

  const user = await users.getUser(userID);
  if (!user) {
    throw new UserNotFoundError({ id: userID });
  }

  await users.updatePassword(user.id, password);

  await redis.del(`reset:${resetToken}`);

  return toItemResponse({}, {
    meta: {
      message: `Updated password for ${user.username}`,
    },
  });
}

/**
 * @param {import('../types.js').AuthenticatedRequest<{}, {}, {}> & WithAuthOptions} req
 * @param {import('express').Response} res
 */
async function logout(req, res) {
  const { user, cookies } = req;
  const { cookieSecure, cookiePath } = req.authOptions;
  const uw = req.uwave;

  uw.publish('user:logout', {
    userID: user.id,
  });

  if (cookies && cookies.uwsession) {
    const serialized = cookie.serialize('uwsession', '', {
      httpOnly: true,
      secure: !!cookieSecure,
      path: cookiePath ?? '/',
      maxAge: 0,
    });
    res.setHeader('Set-Cookie', serialized);
  }

  return toItemResponse({});
}

/**
 * @returns {Promise<import('type-fest').JsonObject>}
 */
async function removeSession() {
  throw new Error('Unimplemented');
}

export {
  changePassword,
  getAuthStrategies,
  getCurrentUser,
  getSocketToken,
  login,
  logout,
  refreshSession,
  register,
  removeSession,
  reset,
  socialLoginCallback,
  socialLoginFinish,
};
