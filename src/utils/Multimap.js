/**
 * A map with multiple values per key.
 *
 * @template K
 * @template T
 */
export default class Multimap {
  /** @type {Map<K, T[]>} */
  #map = new Map()

  /**
   * Return true if the given key exists in the map.
   *
   * @param {K} key
   */
  has (key) {
    return this.#map.has(key)
  }

  /**
   * Get all values for a key.
   *
   * @param {K} key
   */
  get (key) {
    return this.#map.get(key)
  }

  /**
   * Add a key/value pair.
   *
   * @param {K} key
   * @param {T} value
   */
  set (key, value) {
    const existing = this.#map.get(key)
    if (existing) {
      existing.push(value)
    } else {
      this.#map.set(key, [value])
    }
    return this
  }

  /**
   * Delete all elements with a given key. Return true if any elements existed.
   *
   * @param {K} key
   */
  delete (key) {
    return this.#map.delete(key)
  }

  /**
   * Remove a specific element with a given key. Return true if it existed.
   *
   * @param {K} key
   * @param {T} value
   */
  remove (key, value) {
    const existing = this.#map.get(key)
    if (!existing) {
      return false
    }

    // If this is the only element for the key, delete the whole key, so
    // we never have empty keys.
    if (existing.length === 1 && existing[0] === value) {
      return this.#map.delete(key)
    }

    const index = existing.indexOf(value)
    if (index === -1) {
      return false
    }
    existing.splice(index, 1)
    return true
  }

  /** Iterate over the keys in the map. */
  keys () {
    return this.#map.keys()
  }

  [Symbol.iterator] () {
    return this.#map.entries()
  }
}
