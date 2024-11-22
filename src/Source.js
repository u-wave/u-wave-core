import { SourceNoImportError } from './errors/index.js';

/**
 * @typedef {import('./schema.js').User} User
 * @typedef {import('./schema.js').Playlist} Playlist
 * @typedef {import('./plugins/playlists.js').PlaylistItemDesc} PlaylistItemDesc
 */

/**
 * @typedef {{
 *   sourceType: string,
 *   sourceID: string,
 *   sourceData: import('type-fest').JsonObject | null,
 *   artist: string,
 *   title: string,
 *   duration: number,
 *   thumbnail: string,
 * }} SourceMedia
 */

/**
 * @typedef {object} SourcePluginV1
 * @prop {undefined|1} api
 * @prop {(ids: string[]) => Promise<SourceMedia[]>} get
 * @prop {(query: string, page: unknown, ...args: unknown[]) => Promise<SourceMedia[]>} search
 * @prop {(context: ImportContext, ...args: unknown[]) => Promise<unknown>} [import]
 * @typedef {object} SourcePluginV2
 * @prop {2} api
 * @prop {(context: SourceContext, ids: string[]) => Promise<SourceMedia[]>} get
 * @prop {(
 *   context: SourceContext,
 *   query: string,
 *   page: unknown,
 *   ...args: unknown[]
 * ) => Promise<SourceMedia[]>} search
 * @prop {(context: ImportContext, ...args: unknown[]) => Promise<unknown>} [import]
 * @prop {(context: SourceContext, entry: PlaylistItemDesc) =>
 *     Promise<import('type-fest').JsonObject>} [play]
 * @typedef {SourcePluginV1 | SourcePluginV2} SourcePlugin
 */

/**
 * Data holder for things that source plugins may require.
 */
class SourceContext {
  /**
   * @param {import('./Uwave.js').default} uw
   * @param {Source} source
   * @param {User} user
   */
  constructor(uw, source, user) {
    this.uw = uw;
    this.source = source;
    this.user = user;
  }
}

/**
 * Wrapper around playlist functions for use with import plugins. Intended to be
 * temporary until more data manipulation stuff is moved into core from api-v1.
 *
 * This is legacy, media sources should use the methods provided by the
 * `playlists` plugin instead.
 */
class ImportContext extends SourceContext {
  /**
   * Create a playlist for the current user.
   *
   * @param {string} name Playlist name.
   * @param {Omit<PlaylistItemDesc, 'sourceType'>[]} itemOrItems Playlist items.
   * @returns {Promise<Playlist>} Playlist model.
   */
  async createPlaylist(name, itemOrItems) {
    const { playlist } = await this.uw.playlists.createPlaylist(this.user, { name });

    const rawItems = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
    const items = this.source.addSourceType(rawItems);

    if (items.length > 0) {
      await this.uw.playlists.addPlaylistItems(playlist, items);
    }

    return playlist;
  }
}

/**
 * Wrapper around source plugins with some more convenient aliases.
 */
class Source {
  /**
   * @param {import('./Uwave.js').default} uw
   * @param {string} sourceType
   * @param {SourcePlugin} sourcePlugin
   */
  constructor(uw, sourceType, sourcePlugin) {
    this.uw = uw;
    this.type = sourceType;
    this.plugin = sourcePlugin;

    this.addSourceType = this.addSourceType.bind(this);
  }

  get apiVersion() {
    return this.plugin.api ?? 1;
  }

  /**
   * Add a default sourceType property to a list of media items.
   *
   * Media items can provide their own sourceType, too, so media sources can
   * aggregate items from different source types.
   *
   * @template T
   * @param {T[]} items
   * @returns {(T & { sourceType: string })[]}
   */
  addSourceType(items) {
    return items.map((item) => ({
      sourceType: this.type,
      ...item,
    }));
  }

  /**
   * Find a single media item by ID.
   *
   * @param {User} user
   * @param {string} id
   * @returns {Promise<SourceMedia?>}
   */
  getOne(user, id) {
    return this.get(user, [id])
      .then((items) => items[0]);
  }

  /**
   * Find several media items by ID.
   *
   * @param {User} user
   * @param {string[]} ids
   * @returns {Promise<SourceMedia[]>}
   */
  async get(user, ids) {
    let items;
    if (this.plugin.api === 2) {
      const context = new SourceContext(this.uw, this, user);
      items = await this.plugin.get(context, ids);
    } else {
      items = await this.plugin.get(ids);
    }
    return this.addSourceType(items);
  }

  /**
   * Search this media source for items. Parameters can really be anything, but
   * will usually include a search string `query` and a page identifier `page`.
   *
   * @template {object} TPagination
   * @param {User} user
   * @param {string} query
   * @param {TPagination} [page]
   * @param {unknown[]} args
   * @returns {Promise<SourceMedia[]>}
   */
  async search(user, query, page, ...args) {
    let results;
    if (this.plugin.api === 2) {
      const context = new SourceContext(this.uw, this, user);
      results = await this.plugin.search(context, query, page, ...args);
    } else {
      results = await this.plugin.search(query, page, ...args);
    }
    return this.addSourceType(results);
  }

  /**
   * Playback hook. Media sources can use this to pass the necessary data for
   * media playback to clients, for example a temporary signed URL.
   *
   * @param {User} user
   * @param {PlaylistItemDesc} entry
   */
  play(user, entry) {
    if (this.plugin.api === 2 && this.plugin.play != null) {
      const context = new SourceContext(this.uw, this, user);
      return this.plugin.play(context, entry);
    }
    return undefined;
  }

  /**
   * Import *something* from this media source. Because media sources can
   * provide wildly different imports, üWave trusts clients to know what they're
   * doing.
   *
   * @param {User} user
   * @param {unknown[]} args
   */
  'import'(user, ...args) {
    const importContext = new ImportContext(this.uw, this, user);
    if (this.plugin.import != null) {
      return this.plugin.import(importContext, ...args);
    }
    throw new SourceNoImportError({ name: this.type });
  }
}

export {
  SourceContext,
  ImportContext,
  Source,
};
