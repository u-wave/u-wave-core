import process from 'process';
import { Buffer } from 'buffer';
import uwave from 'u-wave-core';
import createWebClient from 'u-wave-web/middleware';
import youTubeSource from 'u-wave-source-youtube';
import soundCloudSource from 'u-wave-source-soundcloud';
import dotenv from 'dotenv';

dotenv.config();

const port = process.env.PORT ?? 80;
const secret = Buffer.from(process.env.SECRET, 'hex');

const DEFAULT_MONGO_URL = 'mongodb://localhost:27017/uwave';
const DEFAULT_REDIS_URL = 'redis://localhost:6379';

const uw = uwave({
  mongo: process.env.MONGO_CONNECTION_URL ?? DEFAULT_MONGO_URL,
  redis: process.env.REDIS_CONNECTION_URL ?? DEFAULT_REDIS_URL,
  port,
  secret,
  // This has to be disabled so the headers do not get added to the web client too.
  helmet: false,
});

uw.use(async function registerSources() {
  // Register your Media Sources. The API keys are configured in the config.json
  // file.
  uw.source(youTubeSource, {
    key: process.env.YOUTUBE_API_KEY,
  });
  uw.source(soundCloudSource, {
    key: process.env.SOUNDCLOUD_API_KEY,
  });
});

uw.use(async function registerWebClient() {
  const webClient = createWebClient({
    apiBase: '/api',
  });

  uw.express.use(webClient);
});

process.on('beforeExit', () => {
  uw.close();
});

await uw.listen();
console.log(`üWave server running on http://localhost:${port}/`);
