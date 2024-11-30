import lodash from 'lodash';
import * as ky from 'kysely';
import { createPool } from 'generic-pool';
import { sql, OperationNodeTransformer } from 'kysely';

/**
 * Typed representation of encoded JSONB. You are not meant to actually instantiate
 * a value of this type :)
 *
 * @template {import('type-fest').JsonValue} T
 * @typedef {import('type-fest').Tagged<Uint8Array, 'SqliteJsonb'> & { __inner: T }} JSONB
 */

/**
 * Typed representation of an encoded JSON string.
 * @template {import('type-fest').JsonValue} T
 * @typedef {import('type-fest').Tagged<string, 'SqliteJson'> & { __inner: T }} SerializedJSON
 */

/**
 * Any SQLite JSON value.
 *
 * @template {import('type-fest').JsonValue} T
 * @typedef {JSONB<T> | SerializedJSON<T>} SqliteJSON
 */

/**
 * @template {import('type-fest').JsonValue} T
 * @param {SerializedJSON<T>} value
 * @returns {T}
 */
export function fromJson(value) {
  return JSON.parse(value);
}

/**
 * Note the `value` and `atom` types might be wrong for non-SQL JSON types
 *
 * @template {unknown[]} T
 * @param {import('kysely').Expression<SqliteJSON<T>>} expr
 * @returns {import('kysely').RawBuilder<{
 *   key: unknown,
 *   value: T[0],
 *   type: string,
 *   atom: T[0],
 *   id: number,
 *   parent: number,
 *   fullkey: string,
 *   path: string,
 * }>}
 */
export function jsonEach(expr) {
  return sql`json_each(${expr})`;
}

/**
 * @template {unknown[]} T
 * @param {import('kysely').Expression<SqliteJSON<T>>} expr
 * @returns {import('kysely').RawBuilder<number>}
 */
export function jsonLength(expr) {
  return sql`json_array_length(${expr})`;
}

/**
 * Turn a JS value into JSONB.
 *
 * @template {import('type-fest').JsonValue} T
 * @param {T} value
 * @returns {import('kysely').RawBuilder<JSONB<T>>}
 */
export function jsonb(value) {
  return sql`jsonb(${JSON.stringify(value)})`;
}

/**
 * Turn a SQLite expression into a JSON string.
 *
 * @template {unknown} T
 * @param {import('kysely').Expression<SqliteJSON<T>>} expr
 * @returns {import('kysely').RawBuilder<SerializedJSON<T>>}
 */
export function json(expr) {
  return sql`json(${expr})`;
}

/**
 * @template {unknown[]} T
 * @param {import('kysely').Expression<SqliteJSON<T>>} expr
 * @returns {import('kysely').RawBuilder<JSONB<T>>}
 */
export function arrayShuffle(expr) {
  return sql`jsonb(json_array_shuffle(${json(expr)}))`;
}

/**
 * Move the first item in an array to the end.
 * This only works on JSONB inputs.
 *
 * @template {unknown[]} T
 * @param {import('kysely').Expression<JSONB<T>>} expr
 * @returns {import('kysely').RawBuilder<JSONB<T>>}
 */
export function arrayCycle(expr) {
  return sql`
    (CASE ${jsonLength(expr)}
      WHEN 0 THEN (${expr})
      ELSE jsonb_insert(
        jsonb_remove((${expr}), '$[0]'),
        '$[#]',
        (${expr})->>0
      )
    END)
  `;
}

/**
 * @template {unknown} T
 * @param {import('kysely').Expression<T>} expr
 * @returns {import('kysely').RawBuilder<SerializedJSON<T[]>>}
 */
export function jsonGroupArray(expr) {
  return sql`json_group_array(${expr})`;
}

/** @type {import('kysely').RawBuilder<Date>} */
export const now = sql`(strftime('%FT%TZ', 'now'))`;

/** Stringify dates before entering them in the database. */
class SqliteDateTransformer extends OperationNodeTransformer {
  /** @param {import('kysely').ValueNode} node */
  transformValue(node) {
    if (node.value instanceof Date) {
      return { ...node, value: node.value.toISOString() };
    }
    return node;
  }

  /** @param {import('kysely').PrimitiveValueListNode} node */
  transformPrimitiveValueList(node) {
    return {
      ...node,
      values: node.values.map((value) => {
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      }),
    };
  }

  /** @param {import('kysely').ColumnUpdateNode} node */
  transformColumnUpdate(node) {
    /**
     * @param {import('kysely').OperationNode} node
     * @returns {node is import('kysely').ValueNode}
     */
    function isValueNode(node) {
      return node.kind === 'ValueNode';
    }

    if (isValueNode(node.value) && node.value.value instanceof Date) {
      return super.transformColumnUpdate({
        ...node,
        value: /** @type {import('kysely').ValueNode} */ ({
          ...node.value,
          value: node.value.value.toISOString(),
        }),
      });
    }
    return super.transformColumnUpdate(node);
  }
}

export class SqliteDateColumnsPlugin {
  /** @param {string[]} dateColumns */
  constructor(dateColumns) {
    this.dateColumns = new Set(dateColumns);
    this.transformer = new SqliteDateTransformer();
  }

  /** @param {import('kysely').PluginTransformQueryArgs} args */
  transformQuery(args) {
    return this.transformer.transformNode(args.node);
  }

  /** @param {string} col */
  #isDateColumn(col) {
    if (this.dateColumns.has(col)) {
      return true;
    }
    const i = col.lastIndexOf('.');
    return i !== -1 && this.dateColumns.has(col.slice(i));
  }

  /** @param {import('kysely').PluginTransformResultArgs} args */
  async transformResult(args) {
    for (const row of args.result.rows) {
      for (let col in row) { // eslint-disable-line no-restricted-syntax
        if (Object.hasOwn(row, col) && this.#isDateColumn(col)) {
          const value = row[col];
          if (typeof value === 'string') {
            row[col] = new Date(value);
          }
        }
      }
    }
    return args.result;
  }
}

/**
 * @param {string} path
 * @returns {Promise<import('better-sqlite3').Database>}
 */
export async function connect(path) {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(path ?? 'uwave_local.sqlite');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.function('json_array_shuffle', { directOnly: true }, (items) => {
    if (typeof items !== 'string') {
      throw new TypeError('json_array_shuffle(): items must be JSON string');
    }
    const array = JSON.parse(items);
    if (!Array.isArray(array)) {
      throw new TypeError('json_array_shuffle(): items must be JSON array');
    }
    return JSON.stringify(lodash.shuffle(array));
  });
  return db;
}

/**
 * @param {unknown} err
 * @returns {err is (Error & { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })}
 */
export function isForeignKeyError(err) {
  return err instanceof Error && 'code' in err && err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY';
}

/**
 * @typedef {{
 *   database: () => Promise<import('better-sqlite3').Database>,
 *   logger?: import('pino').Logger,
 * }} SqliteDialectConfig */

/** @implements {ky.Dialect} */
export class SqliteDialect {
  #config;

  /** @param {SqliteDialectConfig} config */
  constructor(config) {
    this.#config = config;
  }

  createAdapter() {
    return new ky.SqliteAdapter()
  }

  createQueryCompiler() {
    return new ky.SqliteQueryCompiler()
  }

  /** @param {ky.Kysely<unknown>} db */
  createIntrospector(db) {
    return new ky.SqliteIntrospector(db)
  }

  createDriver() {
    return new SqliteDriver(this.#config);
  }
}
/** @implements {ky.Driver} */
export class SqliteDriver {
  #config;
  #pool;

  /** @param {SqliteDialectConfig} config */
  constructor(config) {
    this.#config = config;
    this.#pool = createPool({
      create: async () => new SqliteConnection(await this.#config.database()),
      destroy: async (db) => {
        db.release();
      },
    }, {
      min: 1,
      max: 8,
    });
  }

  async init() {
    await this.#pool.ready();
  }

  async acquireConnection () {
    this.#config.logger?.debug({
      size: this.#pool.size,
      available: this.#pool.available,
      borrowed: this.#pool.borrowed,
    }, 'acquire connection');

    const connection = await this.#pool.acquire();
    return connection;
  }

  /** @param {SqliteConnection} connection */
  async releaseConnection(connection) {
    this.#config.logger?.debug({
      size: this.#pool.size,
      available: this.#pool.available,
      borrowed: this.#pool.borrowed,
    }, 'release connection');

    await this.#pool.release(connection);
  }

  /** @param {SqliteConnection} connection */
  async beginTransaction(connection) {
    connection._beginTransaction();
  }

  /** @param {SqliteConnection} connection */
  async commitTransaction(connection) {
    connection._commitTransaction();
  }

  /** @param {SqliteConnection} connection */
  async rollbackTransaction(connection) {
    connection._rollbackTransaction();
  }

  async destroy() {
    await this.#pool.drain();
    await this.#pool.clear();
  }
}

/** @implements {ky.DatabaseConnection} */
class SqliteConnection {
  #db;

  /** @param {import('better-sqlite3').Database} db */
  constructor(db) {
    this.#db = db;
  }

  release() {
    this.#db.close();
  }

  _beginTransaction() {
    this.#db.exec('BEGIN IMMEDIATE');
  }

  _commitTransaction() {
    this.#db.exec('COMMIT');
  }

  _rollbackTransaction() {
    this.#db.exec('ROLLBACK');
  }

  /**
   * @template O
   * @param {ky.CompiledQuery<unknown>} compiledQuery
   * @returns {Promise<ky.QueryResult<O>>}
   */
  async executeQuery(compiledQuery) {
    const stmt = this.#db.prepare(compiledQuery.sql);
    if (stmt.reader) {
      return {
        rows: /** @type {O[]} */ (stmt.all(compiledQuery.parameters)),
      };
    }

    const { changes, lastInsertRowid } = stmt.run(compiledQuery.parameters);
    return {
      numUpdatedOrDeletedRows: changes != null ? BigInt(changes) : undefined,
      numAffectedRows: changes != null ? BigInt(changes) : undefined,
      insertId: lastInsertRowid != null ? BigInt(lastInsertRowid) : undefined,
      rows: [],
    };
  }

  /**
   * @template O
   * @param {ky.CompiledQuery<unknown>} compiledQuery
   * @param {number} chunkSize
   * @returns {AsyncIterableIterator<ky.QueryResult<O>>}
   */
  async* streamQuery(compiledQuery, chunkSize) {
    const all = await this.executeQuery(compiledQuery);
    void chunkSize;
    for (const row of all.rows) {
      yield { rows: [row] };
    }
  }
}
