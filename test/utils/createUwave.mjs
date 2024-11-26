import 'dotenv/config';
import { once } from 'events';
import { spawn } from 'child_process';
import getPort from 'get-port';
import Redis from 'ioredis';
import uwave from 'u-wave-core';
import testPlugin from './plugin.mjs';

/**
 * Create a separate in-memory redis instance to run tests against.
 * This way tests don't interfere with other redises on the system.
 */
async function createIsolatedRedis() {
  const port = await getPort();

  const proc = spawn('redis-server', ['-']);
  proc.stdin.end(`
    port ${port}
    save ""
  `);

  await once(proc, 'spawn');

  for await (const buf of proc.stdout) {
    if (buf.toString().includes('Ready to accept connections')) {
      break;
    }
  }

  async function close() {
    proc.kill('SIGINT');
    await once(proc, 'close');
  }

  return {
    url: `redis://localhost:${port}`,
    close,
  };
}

/**
 * Connect to Redis, setting up to completely clear the database at the end.
 * This can be used to run tests on CI.
 */
function createRedisConnection() {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

  async function close() {
    const redis = new Redis(url);
    await redis.flushall();
    await redis.quit();
  }

  return {
    url,
    close,
  };
}

async function createUwave(name, options) {
  const redisServer = process.env.REDIS_URL
    ? createRedisConnection()
    : await createIsolatedRedis();

  const port = await getPort();

  const uw = uwave({
    ...options,
    port,
    redis: redisServer.url,
    sqlite: ':memory:',
    secret: Buffer.from(`secret_${name}`),
    logger: {
      level: 'silent',
    },
  });

  uw.use(testPlugin);

  uw.destroy = async () => {
    try {
      await uw.close();
    } finally {
      await redisServer.close();
    }
  };

  await uw.listen();

  return uw;
}

export default createUwave;
