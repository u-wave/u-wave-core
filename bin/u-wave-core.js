#!/usr/bin/env node

/* eslint-disable no-console,n/no-process-exit */
import fs from 'node:fs';
import explain from 'explain-error';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import ytSource from 'u-wave-source-youtube';
import scSource from 'u-wave-source-soundcloud';
import announce from 'u-wave-announce';
import minimist from 'minimist';
import uwave from '../src/index.js';
import emotes from '../src/plugins/emotes.js';

const pkg = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const argv = minimist(process.argv.slice(2));

const ajv = new Ajv({
  removeAdditional: true,
  used: true,
  coerceTypes: true,
  allErrors: true,
  formats: {
    hexadecimal: /^[0-9a-fA-F]+$/,
  },
});
addFormats(ajv);

const envSchema = {
  type: 'object',
  required: ['SECRET'],
  properties: {
    PORT: {
      type: 'number',
      default: 6042,
    },
    REDIS_URL: {
      type: 'string',
      format: 'uri',
      default: 'redis://localhost:6379',
    },
    MONGODB_URL: {
      type: 'string',
      format: 'uri',
      default: 'mongodb://localhost:27017/uwave',
    },
    SECRET: {
      type: 'string',
      format: 'hexadecimal',
      minLength: 64,
      maxLength: 64,
    },
    YOUTUBE_API_KEY: {
      type: 'string',
    },
    EXPERIMENTAL_EMOTES: {
      type: 'boolean',
    },
  },
};

const config = { ...process.env };
const validConfig = ajv.validate(envSchema, config);

if (argv.h || argv.help || !validConfig) {
  console.log('u-wave-core');
  console.log('Version', pkg.version);
  console.log();
  console.log('Environment Variables:');
  console.log('  SECRET');
  console.log('    A secret key used for encrypting passwords. Must be a 64-character hexadecimal string (= 256 bits).');
  console.log('  PORT');
  console.log('    Port to listen on. Defaults to 6042.');
  console.log('  REDIS_URL');
  console.log('    URL of the Redis instance to connect to. Defaults to redis://localhost:6379/.');
  console.log('  MONGODB_URL');
  console.log('    URL of the MongoDB database to use. Defaults to mongodb://localhost:27017/uwave.');
  console.log('  YOUTUBE_API_KEY [optional]');
  console.log('    Your YouTube Data API key.');
  console.log();
}

if (argv.h || argv.help) {
  process.exit(0);
} else if (!validConfig) {
  ajv.errors.forEach((error) => {
    const { keyword, params } = error;
    switch (keyword) {
      case 'required':
        console.error(`⚠️ Missing environment variable ${params.missingProperty}`);
        break;
      default:
        console.error(`⚠️ Environment variable ${error.dataPath.slice(1)} ${error.message}`);
        break;
    }
  });
  process.exit(1);
}

const port = Number(argv.port || config.PORT);

const secret = Buffer.from(config.SECRET, 'hex');

const uw = uwave({
  port,
  redis: config.REDIS_URL,
  mongo: config.MONGODB_URL,
  secret,
});

uw.on('mongoError', (err) => {
  throw explain(err, 'Could not connect to MongoDB. Is it installed and running?');
});

uw.on('redisError', (err) => {
  throw explain(err, 'Could not connect to the Redis server. Is it installed and running?');
});

uw.use(announce);

if (config.EXPERIMENTAL_EMOTES) {
  console.warn('Using experimental third-party emotes integration');
  uw.use(emotes);
}

if (config.YOUTUBE_API_KEY) {
  uw.source(ytSource, {
    key: config.YOUTUBE_API_KEY,
  });
}
uw.source(scSource);

uw.listen(port).then(() => {
  console.log(`Now listening on ${port}`);
}, (error) => {
  console.error(error.stack);
  process.exit(1);
});
