import { sql } from 'kysely';

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
  return sql`json_each(${expr})`
}

/**
 * @template {unknown[]} T
 * @param {import('kysely').Expression<T>} expr
 * @returns {import('kysely').RawBuilder<number>}
 */
export function jsonLength(expr) {
  return sql`json_array_length(${expr})`
}

/** @param {import('type-fest').Jsonifiable} value */
export function jsonb(value) {
  return sql`jsonb(${JSON.stringify(value)})`;
}

/** @type {import('kysely').RawBuilder<Date>} */
export const now = sql`(strftime('%FT%T', 'now'))`;

