import Uwave from './Uwave.js';
import HttpApi from './HttpApi.js';
import SocketServer from './SocketServer.js';

/**
 * @param {import('./Uwave.js').Options} opts
 * @returns {Uwave}
 */
export default function uwave(opts) {
  return new Uwave(opts);
}

export { Uwave, HttpApi, SocketServer };
