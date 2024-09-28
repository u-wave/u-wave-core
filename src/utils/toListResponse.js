import lodash from 'lodash';

const {
  isPlainObject,
  cloneDeep,
  get: getPath,
  set: setPath,
} = lodash;

/**
 * @typedef {Record<string, string[]>} IncludedOptions
 */

/** @param {{ _id: string, id?: undefined } | { _id?: undefined, id: string }} d */
function getID(d) {
  return d._id ?? d.id;
}

/**
 * @param {any[]} data
 * @param {IncludedOptions} included
 */
function extractIncluded(data, included) {
  const includedTypes = Object.keys(included);
  if (includedTypes.length === 0) {
    return {
      data,
      included: {},
    };
  }

  /** @type {Record<string, any[]>} */
  const includeds = includedTypes.reduce(
    (map, typeName) => Object.assign(map, { [typeName]: [] }),
    {},
  );

  /** @type {Set<string>} */
  const had = new Set();

  /**
   * @param {string} type
   * @param {{ _id: string }} item
   */
  function include(type, item) {
    if (!had.has(type + getID(item))) {
      includeds[type].push(item);
      had.add(type + getID(item));
    }
  }

  /** @type {any[]} */
  const resultData = [];
  data.forEach((initialItem) => {
    let item = isPlainObject(initialItem) ? initialItem : initialItem.toJSON();
    includedTypes.forEach((type) => {
      included[type].forEach((path) => {
        const includedItem = getPath(item, path);
        if (includedItem) {
          if (item === initialItem) {
            item = cloneDeep(item);
          }
          if (Array.isArray(includedItem)) {
            setPath(item, path, includedItem.map(getID));
            includedItem.forEach((i) => include(type, i));
          } else {
            setPath(item, path, getID(includedItem));
            include(type, includedItem);
          }
        }
      });
    });
    resultData.push(item);
  });

  return {
    included: includeds,
    data: resultData,
  };
}

/**
 * @typedef {object} ListResponse
 * @prop {import('type-fest').JsonObject} meta
 * @prop {import('type-fest').JsonValue[]} data
 * @prop {import('type-fest').JsonObject} [included]
 * @prop {Record<string, string>} links
 */

/**
 * @template {any} TItem
 * @param {TItem[]} list
 * @param {object} [options]
 * @param {import('type-fest').JsonObject} [options.meta]
 * @param {IncludedOptions} [options.included]
 * @param {string} [options.url]
 */
function toListResponse(list, options = {}) {
  const {
    meta = {},
    included,
    url,
  } = options;

  let props = {
    data: list,
    /** @type {ListResponse['included']} */
    included: undefined,
  };
  if (included) {
    props = extractIncluded(list, included);
  }
  return {
    meta: {
      included,
      ...meta,
    },
    links: url ? { self: url } : {},
    ...props,
  };
}

export default toListResponse;
