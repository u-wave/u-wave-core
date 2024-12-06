import assert from 'node:assert';
import nodeCrypto from 'node:crypto';
import { promisify } from 'node:util';

const randomBytes = promisify(nodeCrypto.randomBytes);

class AuthRegistry {
  #redis;

  /**
   * @param {import('ioredis').default} redis
   */
  constructor(redis) {
    this.#redis = redis;
  }

  /**
   * @param {import('./schema.js').User} user
   * @param {string} sessionID
   */
  async createAuthToken(user, sessionID) {
    const token = (await randomBytes(64)).toString('hex');
    await this.#redis.set(`http-api:socketAuth:${token}`, `${user.id}/${sessionID}`, 'EX', 60);
    return token;
  }

  /**
   * @param {string} token
   */
  async getTokenUser(token) {
    if (token.length !== 128) {
      throw new Error('Invalid token');
    }
    const result = await this.#redis
      .multi()
      .get(`http-api:socketAuth:${token}`)
      .del(`http-api:socketAuth:${token}`)
      .exec();
    assert(result);

    const [err, authParts] = result[0];
    if (err) {
      throw err;
    }
    if (typeof authParts !== 'string') {
      throw new Error('Invalid auth parts');
    }

    const index = authParts.indexOf('/');
    if (index === -1) {
      throw new Error('Invalid auth parts');
    }

    const userID = /** @type {import('./schema.js').UserID} */ (authParts.slice(0, index));
    const sessionID = authParts.slice(index + 1);

    return { userID, sessionID };
  }
}

export default AuthRegistry;
