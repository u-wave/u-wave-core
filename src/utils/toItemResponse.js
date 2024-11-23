/**
 * @template {object|null} T
 * @param {T} item
 * @param {{ url?: string, meta?: object }} options
 */
function toItemResponse(item, {
  url = '',
  meta = {},
} = {}) {
  return {
    meta,
    links: url ? { self: url } : {},
    data: item,
  };
}

export default toItemResponse;
