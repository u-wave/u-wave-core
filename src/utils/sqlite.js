import lodash from 'lodash';
import { sql, OperationNodeTransformer } from 'kysely';

/**
 * @template {unknown[]} T
 * @param {import('kysely').Expression<T>} expr
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
 * @param {import('kysely').Expression<T>} expr
 * @returns {import('kysely').RawBuilder<number>}
 */
export function jsonLength(expr) {
  return sql`json_array_length(${expr})`;
}

/**
 * @param {import('type-fest').Jsonifiable} value
 * @returns {import('kysely').RawBuilder<any>}
 */
export function jsonb(value) {
  return sql`jsonb(${JSON.stringify(value)})`;
}

/**
 * @template {unknown[]} T
 * @param {import('kysely').Expression<T>} expr
 * @returns {import('kysely').RawBuilder<T>}
 */
export function json(expr) {
  return sql`json(${expr})`;
}

/**
 * @template {unknown[]} T
 * @param {import('kysely').Expression<T>} expr
 * @returns {import('kysely').RawBuilder<T>}
 */
export function arrayShuffle(expr) {
  return sql`jsonb(json_array_shuffle(${json(expr)}))`;
}

/**
 * @template {unknown[]} T
 * @param {import('kysely').Expression<T>} expr
 * @returns {import('kysely').RawBuilder<T>}
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
 * @returns {import('kysely').RawBuilder<T[]>}
 */
export function jsonGroupArray(expr) {
  return sql`json_group_array(${expr})`;
}

/** @type {import('kysely').RawBuilder<Date>} */
export const now = sql`(strftime('%FT%T', 'now'))`;

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
      for (let col in row) {
        if (this.#isDateColumn(col)) {
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
    items = JSON.parse(items);
    if (!Array.isArray(items)) {
      throw new TypeError('json_array_shuffle(): items must be JSON array');
    }
    return JSON.stringify(lodash.shuffle(items));
  });
  return db;
}
