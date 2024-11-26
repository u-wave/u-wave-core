import EventEmitter from 'node:events';
import { promisify } from 'node:util';
import Redis from 'ioredis';
import avvio from 'avvio';
import { pino } from 'pino';
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely';
import httpApi, { errorHandling } from './HttpApi.js';
import SocketServer from './SocketServer.js';
import { Source } from './Source.js';
import { i18n } from './locale.js';
import configStore from './plugins/configStore.js';
import booth from './plugins/booth.js';
import chat from './plugins/chat.js';
import motd from './plugins/motd.js';
import playlists from './plugins/playlists.js';
import users from './plugins/users.js';
import bans from './plugins/bans.js';
import history from './plugins/history.js';
import acl from './plugins/acl.js';
import waitlist from './plugins/waitlist.js';
import passport from './plugins/passport.js';
import migrations from './plugins/migrations.js';
import { SqliteDateColumnsPlugin, connect as connectSqlite } from './utils/sqlite.js';

const DEFAULT_MONGO_URL = 'mongodb://localhost:27017/uwave';
const DEFAULT_REDIS_URL = 'redis://localhost:6379';

class UwCamelCasePlugin extends CamelCasePlugin {
  /**
   * @param {string} str
   * @override
   * @protected
   */
  camelCase(str) {
    return super.camelCase(str).replace(/Id$/, 'ID');
  }
}

/**
 * @typedef {import('./Source.js').SourcePlugin} SourcePlugin
 */

/**
 * @typedef {UwaveServer & avvio.Server<UwaveServer>} Boot
 * @typedef {Pick<
 *   import('ioredis').RedisOptions,
 *   'port' | 'host' | 'family' | 'path' | 'db' | 'password' | 'username' | 'tls'
 * >} RedisOptions
 * @typedef {{
 *   port?: number,
 *   sqlite?: string,
 *   mongo?: string,
 *   redis?: string | RedisOptions,
 *   logger?: import('pino').LoggerOptions,
 * } & import('./HttpApi.js').HttpApiOptions} Options
 */

class UwaveServer extends EventEmitter {
  /** @type {import('ioredis').default} */
  redis;

  /** @type {import('http').Server} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  server;

  /** @type {import('express').Application} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  express;

  /** @type {import('./plugins/acl.js').Acl} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  acl;

  /** @type {import('./plugins/bans.js').Bans} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  bans;

  /** @type {import('./plugins/booth.js').Booth} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  booth;

  /** @type {import('./plugins/chat.js').Chat} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  chat;

  /** @type {import('./plugins/configStore.js').ConfigStore} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  config;

  /** @type {import('./plugins/emotes.js').Emotes|null} */
  emotes = null;

  /** @type {import('./plugins/history.js').HistoryRepository} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  history;

  /** @type {import('./plugins/migrations.js').Migrate} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  migrate;

  /** @type {import('./plugins/motd.js').MOTD} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  motd;

  /** @type {import('./plugins/passport.js').Passport} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  passport;

  /** @type {import('./plugins/playlists.js').PlaylistsRepository} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  playlists;

  /** @type {import('./plugins/users.js').UsersRepository} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  users;

  /** @type {import('./plugins/waitlist.js').Waitlist} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  waitlist;

  /** @type {import('./HttpApi.js').HttpApi} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  httpApi;

  /** @type {import('./SocketServer.js').default} */
  // @ts-expect-error TS2564 Definitely assigned in a plugin
  socketServer;

  /**
   * @type {Map<string, Source>}
   */
  #sources = new Map();

  /**
   * @param {Options} options
   */
  constructor(options) {
    super();

    const boot = avvio(this);

    this.logger = pino({
      ...options.logger,
      redact: ['req.headers.cookie', 'res.headers["set-cookie"]'],
    });
    this.locale = i18n.cloneInstance();

    this.options = {
      mongo: DEFAULT_MONGO_URL,
      redis: DEFAULT_REDIS_URL,
      ...options,
    };

    /** @type {Kysely<import('./schema.js').Database>} */
    this.db = new Kysely({
      dialect: new SqliteDialect({
        database: () => connectSqlite(options.sqlite ?? 'uwave_local.sqlite'),
      }),
      // dialect: new PostgresDialect({
      //   pool: new pg.Pool({
      //     user: 'uwave',
      //     database: 'uwave_test',
      //   }),
      // }),
      plugins: [
        new UwCamelCasePlugin(),
        new SqliteDateColumnsPlugin(['createdAt', 'updatedAt', 'expiresAt', 'playedAt', 'lastSeenAt']),
      ],
    });

    if (typeof options.redis === 'string') {
      this.redis = new Redis(options.redis, { lazyConnect: true });
    } else {
      this.redis = new Redis({ ...options.redis, lazyConnect: true });
    }

    this.configureRedis();

    boot.onClose(() => Promise.all([
      this.redis.quit(),
      this.db.destroy(),
    ]));

    boot.use(migrations);
    boot.use(configStore);

    boot.use(passport, {
      secret: this.options.secret,
    });

    // Initial API setup
    boot.use(httpApi, {
      secret: this.options.secret,
      helmet: this.options.helmet,
      mailTransport: this.options.mailTransport,
      recaptcha: this.options.recaptcha,
      createPasswordResetEmail: this.options.createPasswordResetEmail,
      onError: this.options.onError,
    });
    boot.use(SocketServer.plugin);

    boot.use(acl);
    boot.use(chat);
    boot.use(motd);
    boot.use(playlists);
    boot.use(users);
    boot.use(bans);
    boot.use(history);
    boot.use(waitlist);
    boot.use(booth);

    boot.use(errorHandling);
  }

  /**
   * An array of registered sources.
   *
   * @type {Source[]}
   */
  get sources() {
    return [...this.#sources.values()];
  }

  /**
   * Get or register a source plugin.
   * If the first parameter is a string, returns an existing source plugin.
   * Else, adds a source plugin and returns its wrapped source plugin.
   *
   * @typedef {((uw: UwaveServer, opts: object) => SourcePlugin)} SourcePluginFactory
   * @typedef {SourcePlugin | SourcePluginFactory} ToSourcePlugin
   * @param {string | Omit<ToSourcePlugin, 'default'> | { default: ToSourcePlugin }} sourcePlugin
   *     Source name or definition.
   *     When a string: Source type name.
   *     Used to signal where a given media item originated from.
   *     When a function or object: Source plugin or plugin factory.
   * @param {object} opts Options to pass to the source plugin. Only used if
   *     a source plugin factory was passed to `sourcePlugin`.
   */
  source(sourcePlugin, opts = {}) {
    if (typeof sourcePlugin === 'string') {
      return this.#sources.get(sourcePlugin);
    }

    const sourceFactory = 'default' in sourcePlugin && sourcePlugin.default ? sourcePlugin.default : sourcePlugin;
    if (typeof sourceFactory !== 'function' && typeof sourceFactory !== 'object') {
      throw new TypeError(`Source plugin should be a function, got ${typeof sourceFactory}`);
    }

    const sourceDefinition = typeof sourceFactory === 'function'
      ? sourceFactory(this, opts)
      : sourceFactory;
    const sourceType = sourceDefinition.name;
    if (typeof sourceType !== 'string') {
      throw new TypeError('Source plugin does not specify a name. It may be incompatible with this version of üWave.');
    }
    const newSource = new Source(this, sourceType, sourceDefinition);

    this.#sources.set(sourceType, newSource);

    return newSource;
  }

  /**
   * @private
   */
  configureRedis() {
    const log = this.logger.child({ ns: 'uwave:redis' });

    this.redis.on('error', (error) => {
      log.error(error);
      this.emit('redisError', error);
    });
    this.redis.on('reconnecting', () => {
      log.info('trying to reconnect...');
    });

    this.redis.on('end', () => {
      log.info('disconnected');
      this.emit('redisDisconnect');
    });

    this.redis.on('connect', () => {
      log.info('connected');
      this.emit('redisConnect');
    });
  }

  /**
   * Publish an event to the üWave channel.
   *
   * @template {keyof import('./redisMessages.js').ServerActionParameters} CommandName
   * @param {CommandName} command
   * @param {import('./redisMessages.js').ServerActionParameters[CommandName]} data
   */
  publish(command, data) {
    return this.redis.publish('uwave', JSON.stringify({ command, data }));
  }

  async listen() {
    /** @type {import('avvio').Avvio<this>} */
    // @ts-expect-error TS2322
    const boot = this; // eslint-disable-line @typescript-eslint/no-this-alias
    await boot.ready();

    /** @type {(this: import('net').Server, port?: number) => Promise<void>} */
    const listen = promisify(this.server.listen);
    await listen.call(this.server, this.options.port);
  }
}

export default UwaveServer;
