import { fileURLToPath } from 'node:url';
import RedLock from 'redlock';
import { Umzug } from 'umzug';

/**
 * @typedef {import('../Uwave.js').default} Uwave
 */

/**
 * Custom MongoDBStorage based on Mongoose and with timestamps.
 */
const mongooseStorage = {
  /**
   * @param {import('umzug').MigrationParams<Uwave>} params
   */
  async logMigration({ name, context: uw }) {
    const { Migration } = uw.models;

    await Migration.create({
      migrationName: name,
    });
  },

  /**
   * @param {import('umzug').MigrationParams<Uwave>} params
   */
  async unlogMigration({ name, context: uw }) {
    const { Migration } = uw.models;

    await Migration.deleteOne({
      migrationName: name,
    });
  },

  /**
   * @param {{ context: Uwave }} params
   */
  async executed({ context: uw }) {
    const { Migration } = uw.models;

    /** @type {{ migrationName: string }[]} */
    const documents = await Migration.find({})
      .select({ migrationName: 1 })
      .lean();
    return documents.map((doc) => doc.migrationName);
  },
};

const kyselyStorage = {
  /**
   * @param {import('umzug').MigrationParams<Uwave>} params
   */
  async logMigration({ name, context: uw }) {
    const { db } = uw;

    await db.insertInto('migrations')
      .values({ name })
      .execute();
  },

  /**
   * @param {import('umzug').MigrationParams<Uwave>} params
   */
  async unlogMigration({ name, context: uw }) {
    const { db } = uw;

    await db.deleteFrom('migrations')
      .where('name', '=', name)
      .execute();
  },

  /**
   * @param {{ context: Uwave }} params
   */
  async executed({ context: uw }) {
    const { db } = uw;
    const rows = await db.selectFrom('migrations').select(['name']).execute();

    return rows.map((row) => row.name);
  },
};

const storage = {
  logMigration: kyselyStorage.logMigration,
  /**
   * @param {import('umzug').MigrationParams<Uwave>} params
   */
  async unlogMigration(params) {
    await kyselyStorage.unlogMigration(params);
    await mongooseStorage.unlogMigration(params);
  },
  /**
   * @param {{ context: Uwave }} params
   */
  async executed(params) {
    const kyselyRows = await kyselyStorage.executed(params);
    const mongooseRows = await mongooseStorage.executed(params);
    return [...mongooseRows, ...kyselyRows];
  },
};

/**
 * @typedef {import('umzug').InputMigrations<Uwave>} MigrateOptions
 * @typedef {(opts: MigrateOptions) => Promise<void>} Migrate
 */

/**
 * @param {Uwave} uw
 */
async function migrationsPlugin(uw) {
  const redLock = new RedLock([uw.redis]);

  /** @type {Migrate} */
  async function migrate(migrations) {
    const migrator = new Umzug({
      migrations,
      context: uw,
      storage,
      logger: uw.logger.child({ ns: 'uwave:migrations' }),
    });

    await redLock.using(['migrate'], 10000, async () => {
      await migrator.up();
    });
  }
  uw.migrate = migrate;

  try {
    await uw.migrate({
      glob: ['*.cjs', { cwd: fileURLToPath(new URL('../migrations', import.meta.url)) }],
    });
  } catch (err) {
    if (err.migration) err.migration.context = null;
    throw err;
  }
}

export default migrationsPlugin;
