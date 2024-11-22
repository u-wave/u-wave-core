import httpErrors from 'http-errors';
import wrapMiddleware from '../utils/wrapMiddleware.js';

const { BadRequest } = httpErrors;

function requireActiveConnection() {
  /**
   * @param {import('../Uwave.js').default} uwave
   * @param {import('../schema.js').User} user
   */
  async function isConnected(uwave, user) {
    const onlineIDs = await uwave.redis.lrange('users', 0, -1);
    return onlineIDs.indexOf(user.id) !== -1;
  }

  return wrapMiddleware(async (req) => {
    const connected = req.user && await isConnected(req.uwave, req.user);
    if (!connected) {
      throw new BadRequest('You need to be logged in and connected to do this.');
    }
  });
}

export default requireActiveConnection;
