import { once } from 'node:events';
import minimist from 'minimist';
import concat from 'concat-stream';
import explain from 'explain-error';
import announce from 'u-wave-announce';
import ytSource from 'u-wave-source-youtube';
import scSource from 'u-wave-source-soundcloud';
import pino from 'pino';
import dotenv from 'dotenv';
import uwave from '../src/index.js';
import emotes from '../src/plugins/emotes.js';

const argv = minimist(process.argv.slice(2));

dotenv.config();

const logger = pino({ level: 'trace' });

const testTransport = {
  name: 'test',
  version: '0.0.0',
  send(mail, callback) {
    mail.message.createReadStream().pipe(concat((message) => {
      logger.info('send test email', { to: mail.message.getEnvelope().to, contents: message.toString('utf8') });
      callback(null, {
        envelope: mail.message.getEnvelope(),
        messageId: mail.message.messageId(),
      });
    }));
  },
};

/**
 * üWave API development server.
 */
async function start() {
  const port = Number(argv.port ?? process.env.PORT ?? 6042);

  const secret = Buffer.from('none', 'utf8');

  const uw = uwave({
    port,
    redis: process.env.REDIS_URL,
    sqlite: process.env.SQLITE_PATH ?? 'uwave.sqlite',
    logger: { level: 'trace' },
    secret,
    mailTransport: testTransport,
    timeout: 10,
  });

  uw.use(emotes);

  uw.use(async (instance) => {
    instance.express.set('json spaces', 2);
  });

  uw.on('redisError', (err) => {
    throw explain(err, 'Could not connect to the Redis server. Is it installed and running?');
  });

  uw.use(announce, {
    // Omit this in a real app: it will auto-generate one for you.
    seed: Buffer.from('8286a5e55c62d93a042b8c56c8face52c05354c288807d941751f0e9060c2ded', 'hex'),
  });

  uw.use(async (instance) => {
    if (process.env.YOUTUBE_API_KEY) {
      instance.source(ytSource, {
        key: process.env.YOUTUBE_API_KEY,
      });
    }
    instance.source(scSource, {
      key: process.env.SOUNDCLOUD_API_KEY,
    });
  });

  await uw.listen();
  logger.info('Now listening', { port });

  await once(process, 'SIGINT');

  /** @type {import('../src/Uwave.js').Boot} */ (uw).close((err) => {
    if (err != null) {
      console.error(err);
      process.exitCode = 1;
    }
  });
}

await start();
