import has from 'has';
import { Strategy } from 'passport';
import jwt from 'jsonwebtoken';
import { BannedError } from '../errors/index.js';

/**
 * @typedef {import('../schema.js').UserID} UserID
 * @typedef {import('../schema.js').User} User
 */

/**
 * @param {Record<string, string>} cookies
 */
function getCookieToken(cookies) {
  return cookies && cookies.uwsession;
}

/**
 * @param {import('qs').ParsedQs} query
 */
function getQueryToken(query) {
  return query && typeof query.token === 'string' ? query.token : null;
}

/**
 * @param {import('http').IncomingHttpHeaders} headers
 */
function getHeaderToken(headers) {
  if (headers.authorization) {
    const parts = headers.authorization.split(' ');
    if (parts[0].toLowerCase() === 'jwt') {
      return parts[1];
    }
  }
  return null;
}

/**
 * @param {unknown} obj
 * @returns {obj is { id: UserID }}
 */
function isUserIDToken(obj) {
  return typeof obj === 'object'
    && obj !== null
    && has(obj, 'id')
    && typeof obj.id === 'string';
}

/** @typedef {(claim: { id: UserID }) => Promise<User|null>} GetUserFn */

class JWTStrategy extends Strategy {
  /**
   * @param {Buffer|string} secret
   * @param {GetUserFn} getUser
   */
  constructor(secret, getUser) {
    super();
    /** @private */
    this.secret = secret;
    /** @private */
    this.getUser = getUser;
  }

  /**
   * @param {import('express').Request} req
   */
  authenticate(req) {
    this.authenticateP(req).catch((err) => {
      this.error(err);
    });
  }

  /**
   * @param {import('express').Request} req
   * @private
   */
  async authenticateP(req) {
    const { bans } = req.uwave;

    const token = getQueryToken(req.query)
      ?? getHeaderToken(req.headers)
      ?? getCookieToken(req.cookies);
    if (!token) {
      return this.pass();
    }

    /** @type {unknown} */
    let value;
    try {
      value = jwt.verify(token, this.secret);
    } catch {
      return this.pass();
    }

    if (!isUserIDToken(value)) {
      return this.pass();
    }

    const user = await this.getUser(value);
    if (!user) {
      return this.pass();
    }

    if (user.pendingActivation) {
      req.pendingUser = user;
      return this.pass();
    }

    if (await bans.isBanned(user)) {
      throw new BannedError();
    }

    return this.success(user);
  }
}

export default JWTStrategy;
