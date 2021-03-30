'use strict';

const Uwave = require('./Uwave');
const HttpApi = require('./HttpApi');
const SocketServer = require('./SocketServer');
const UwaveError = require('./errors/UwaveError');

/**
 * @param {object} opts
 */
module.exports = function uwave(opts) {
  return new Uwave(opts);
};

Object.assign(module.exports, {
  Uwave,
  UwaveError,
  HttpApi,
  SocketServer,
});
