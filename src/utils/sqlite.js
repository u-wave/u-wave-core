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
