import fs from 'node:fs';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import qs from 'qs';
import { pinoHttp } from 'pino-http';

// routes
import authenticate from './routes/authenticate.js';
import bans from './routes/bans.js';
import search from './routes/search.js';
import server from './routes/server.js';
import users from './routes/users.js';
import now from './routes/now.js';
import imports from './routes/import.js';

// middleware
import addFullUrl from './middleware/addFullUrl.js';
import attachUwaveMeta from './middleware/attachUwaveMeta.js';
import rateLimit from './middleware/rateLimit.js';
import errorHandler from './middleware/errorHandler.js';

// utils
import AuthRegistry from './AuthRegistry.js';
import matchOrigin from './utils/matchOrigin.js';

const optionsSchema = JSON.parse(
  fs.readFileSync(new URL('./schemas/httpApi.json', import.meta.url), 'utf8'),
);

/**
 * @param {{ token: string, requestUrl: string }} options
 * @returns {import('nodemailer').SendMailOptions}
 */
function defaultCreatePasswordResetEmail({ token, requestUrl }) {
  const parsed = new URL(requestUrl);
  const { hostname } = parsed;
  const resetLink = new URL(`/reset/${token}`, parsed);
  return {
    from: `noreply@${hostname}`,
    subject: 'üWave Password Reset Request',
    text: `
      Hello,

      To reset your password, please visit:
      ${resetLink}
    `,
  };
}

/**
 * @typedef {express.Router & { authRegistry: AuthRegistry }} HttpApi
 */

/**
 * @typedef {object} HttpApiOptions - Static options for the HTTP API.
 * @prop {string|Buffer} secret
 * @prop {boolean} [helmet]
 * @prop {(error: Error) => void} [onError]
 * @prop {{ secret: string }} [recaptcha]
 * @prop {import('nodemailer').Transport} [mailTransport]
 * @prop {(options: { token: string, requestUrl: string }) =>
 *   import('nodemailer').SendMailOptions} [createPasswordResetEmail]
 *
 * @typedef {object} HttpApiSettings - Runtime options for the HTTP API.
 * @prop {string[]} allowedOrigins
 */

/**
 * @param {import('./Uwave.js').Boot} uw
 * @param {HttpApiOptions} options
 */
async function httpApi(uw, options) {
  if (!options.secret) {
    throw new TypeError('"options.secret" is empty. This option is used to sign authentication '
      + 'keys, and is required for security reasons.');
  }

  if (options.onError != null && typeof options.onError !== 'function') {
    throw new TypeError('"options.onError" must be a function.');
  }

  const logger = uw.logger.child({
    ns: 'uwave:http-api',
  });

  uw.config.register(optionsSchema['uw:key'], optionsSchema);

  /** @type {HttpApiSettings} */
  // @ts-expect-error TS2322: get() always returns a validated object here
  let runtimeOptions = await uw.config.get(optionsSchema['uw:key']);
  const unsubscribe = uw.config.subscribe('u-wave:api', /** @param {HttpApiSettings} settings */ (settings) => {
    runtimeOptions = settings;
  });

  logger.debug(runtimeOptions, 'start HttpApi');
  uw.httpApi = Object.assign(express.Router(), {
    authRegistry: new AuthRegistry(uw.redis),
  });

  uw.httpApi
    .use(pinoHttp({
      genReqId: () => randomUUID(),
      quietReqLogger: true,
      logger,
    }))
    .use(bodyParser.json())
    .use(cookieParser())
    .use(uw.passport.initialize())
    .use(addFullUrl())
    .use(attachUwaveMeta(uw.httpApi, uw))
    .use(uw.passport.authenticate('jwt'))
    .use(rateLimit('api-http', { max: 500, duration: 60 * 1000 }));

  uw.httpApi
    .use('/auth', authenticate(uw.passport, {
      secret: options.secret,
      mailTransport: options.mailTransport,
      recaptcha: options.recaptcha,
      createPasswordResetEmail:
        options.createPasswordResetEmail ?? defaultCreatePasswordResetEmail,
    }))
    .use('/bans', bans())
    .use('/import', imports())
    .use('/now', now())
    .use('/search', search())
    .use('/server', server())
    .use('/users', users());

  uw.express = express();
  uw.express.set('query parser', /** @param {string} str */ (str) => qs.parse(str, { depth: 1 }));

  uw.server = http.createServer(uw.express);
  if (options.helmet !== false) {
    uw.express.use(helmet({
      referrerPolicy: {
        policy: ['origin-when-cross-origin'],
      },
    }));
  }

  /** @type {import('cors').CorsOptions} */
  const corsOptions = {
    origin(origin, callback) {
      callback(null, matchOrigin(origin, runtimeOptions.allowedOrigins));
    },
  };
  uw.express.options('/api/*path', cors(corsOptions));
  uw.express.use('/api', cors(corsOptions), uw.httpApi);
  // An older name
  uw.express.use('/v1', cors(corsOptions), uw.httpApi);

  uw.onClose(() => {
    unsubscribe();
    uw.server.close();
  });
}

/**
 * @param {import('./Uwave.js').Boot} uw
 */
async function errorHandling(uw) {
  uw.logger.debug({ ns: 'uwave:http-api' }, 'setup HTTP error handling');
  uw.httpApi.use(errorHandler({
    onError(_req, error) {
      uw.logger.error({ err: error, ns: 'uwave:http-api' });
    },
  }));
}

export default httpApi;
export { errorHandling };
