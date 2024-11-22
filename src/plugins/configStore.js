import fs from 'node:fs';
import EventEmitter from 'node:events';
import Ajv from 'ajv/dist/2019.js';
import formats from 'ajv-formats';
import jsonMergePatch from 'json-merge-patch';
import sjson from 'secure-json-parse';
import ValidationError from '../errors/ValidationError.js';
import { sql } from 'kysely';
import { jsonb } from '../utils/sqlite.js';

/**
 * @typedef {import('type-fest').JsonObject} JsonObject
 * @typedef {import('../schema.js').UserID} UserID
 * @typedef {import('../schema.js').User} User
 */

const CONFIG_UPDATE_MESSAGE = 'configStore:update';

/**
 * Extensible configuration store.
 *
 * The config store contains named groups of settings. Each setting group is
 * stored in its own MongoDB Document. Groups have associated JSON Schemas to
 * check that the configuration is correct.
 */
class ConfigStore {
  #uw;

  #logger;

  #subscriber;

  #ajv;

  #emitter = new EventEmitter();

  /** @type {Map<string, import('ajv').ValidateFunction<unknown>>} */
  #validators = new Map();

  /**
   * @param {import('../Uwave.js').Boot} uw
   */
  constructor(uw) {
    this.#uw = uw;
    this.#logger = uw.logger.child({ ns: 'uwave:config' });
    this.#subscriber = uw.redis.duplicate();
    this.#ajv = new Ajv({
      useDefaults: true,
      // Allow unknown keywords (`uw:xyz`)
      strict: false,
      strictTypes: true,
    });
    formats(this.#ajv);
    this.#ajv.addMetaSchema(JSON.parse(
      fs.readFileSync(new URL('../../node_modules/ajv/dist/refs/json-schema-draft-07.json', import.meta.url), 'utf8'),
    ));
    this.#ajv.addSchema(JSON.parse(
      fs.readFileSync(new URL('../schemas/definitions.json', import.meta.url), 'utf8'),
    ));

    this.#subscriber.on('message', (_channel, command) => {
      this.#onServerMessage(command);
    });

    uw.use(async () => this.#subscriber.subscribe('uwave'));
  }

  /**
   * @param {string} rawCommand
   */
  async #onServerMessage(rawCommand) {
    /**
     * @type {undefined|{
     *   command: string,
     *   data: import('../redisMessages.js').ServerActionParameters['configStore:update'],
     * }}
     */
    const json = sjson.safeParse(rawCommand);
    if (!json) {
      return;
    }
    const { command, data } = json;
    if (command !== CONFIG_UPDATE_MESSAGE) {
      return;
    }

    this.#logger.trace({ command, data }, 'handle config update');

    try {
      const updatedSettings = await this.get(data.key);
      this.#emitter.emit(data.key, updatedSettings, data.user, data.patch);
    } catch (error) {
      this.#logger.error({ err: error }, 'could not retrieve settings after update');
    }
  }

  /**
   * @template {JsonObject} TSettings
   * @param {string} key
   * @param {(settings: TSettings, user: UserID|null, patch: Partial<TSettings>) => void} listener
   */
  subscribe(key, listener) {
    this.#emitter.on(key, listener);
    return () => this.#emitter.off(key, listener);
  }

  /**
   * @param {string} name
   * @param {JsonObject} value
   * @returns {Promise<JsonObject|null>} The old values.
   */
  async #save(name, value) {
    const { db } = this.#uw;

    const previous = await db.transaction().execute(async (tx) => {
      const row = await tx.selectFrom('configuration')
        .select(sql`json(value)`.as('value'))
        .where('name', '=', name)
        .executeTakeFirst();

      await tx.insertInto('configuration')
        .values({ name, value: jsonb(value) })
        .onConflict((oc) => oc.column('name').doUpdateSet({ value: jsonb(value) }))
        .execute();

      return row?.value != null ? JSON.parse(/** @type {string} */ (row.value)) : null;
    });

    return previous;
  }

  /**
   * @param {string} key
   * @returns {Promise<JsonObject|null>}
   */
  async #load(key) {
    const { db } = this.#uw;

    const row = await db.selectFrom('configuration')
      .select(sql`json(value)`.as('value'))
      .where('name', '=', key)
      .executeTakeFirst();
    if (!row) {
      return null;
    }

    return JSON.parse(/** @type {string} */ (row.value));
  }

  /**
   * Add a config group.
   *
   * @param {string} key - The name of the config group.
   * @param {import('ajv').SchemaObject} schema - The JSON schema that the settings must
   *     follow.
   * @public
   */
  register(key, schema) {
    this.#validators.set(key, this.#ajv.compile(schema));
  }

  /**
   * Get the current settings for a config group.
   *
   * @param {string} key
   * @returns {Promise<undefined | JsonObject>}
   *     `undefined` if the config group named `key` does not
   *     exist. An object containing current settings otherwise.
   * @public
   */
  async get(key) {
    const validate = this.#validators.get(key);
    if (!validate) {
      return undefined;
    }

    const config = (await this.#load(key)) ?? {};
    // Allowed to fail--just fills in defaults
    validate(config);

    return config;
  }

  /**
   * Update settings for a config group. Optionally specify the user who is updating the settings.
   *
   * Rejects if the settings do not follow the schema for the config group.
   *
   * @param {string} key
   * @param {JsonObject} settings
   * @param {{ user?: User }} [options]
   * @public
   */
  async set(key, settings, options = {}) {
    const { user } = options;
    const validate = this.#validators.get(key);
    if (validate) {
      if (!validate(settings)) {
        this.#logger.trace({ key, errors: validate.errors }, 'config validation error');
        throw new ValidationError(validate.errors, this.#ajv);
      }
    }

    const oldSettings = await this.#save(key, settings);
    const patch = jsonMergePatch.generate(oldSettings, settings) ?? Object.create(null);

    this.#logger.trace({ key, patch }, 'fire config update');
    await this.#uw.publish(CONFIG_UPDATE_MESSAGE, {
      key,
      user: user ? user.id : null,
      patch,
    });
  }

  /**
   * Get *all* settings.
   *
   * @returns {Promise<{ [key: string]: JsonObject }>}
   */
  async getAllConfig() {
    const { db } = this.#uw;

    const results = await db.selectFrom('configuration')
      .select(['name', sql`json(value)`.as('value')])
      .execute();

    const configs = Object.create(null);
    for (const [key, validate] of this.#validators.entries()) {
      const row = results.find((m) => m.name === key);
      if (row) {
        const value = JSON.parse(/** @type {string} */ (row.value));
        validate(value);
        configs[key] = value;
      } else {
        configs[key] = {};
      }
    }
    return configs;
  }

  /**
   * @returns {import('ajv').SchemaObject}
   */
  getSchema() {
    const properties = Object.create(null);
    const required = [];
    for (const [key, validate] of this.#validators.entries()) {
      properties[key] = validate.schema;
      required.push(key);
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  async destroy() {
    await this.#subscriber.quit();
  }
}

/**
 * @param {import('../Uwave.js').Boot} uw
 */
async function configStorePlugin(uw) {
  uw.config = new ConfigStore(uw);
  uw.onClose(() => uw.config.destroy());
}

export default configStorePlugin;
export { ConfigStore };
