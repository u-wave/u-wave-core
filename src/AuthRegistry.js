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
   */
  async createAuthToken(user) {
    const token = (await randomBytes(64)).toString('hex');
    await this.#redis.set(`http-api:socketAuth:${token}`, user.id, 'EX', 60);
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

    const [err, userID] = result[0];
    if (err) {
      throw err;
    }

    return /** @type {import('./schema.js').UserID} */ (userID);
  }
}

export default AuthRegistry;
