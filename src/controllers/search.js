import lodash from 'lodash';
import { SourceNotFoundError } from '../errors/index.js';
import toListResponse from '../utils/toListResponse.js';
import { json, jsonb } from '../utils/sqlite.js';

const { isEqual } = lodash;

/** @typedef {import('../schema.js').UserID} UserID */
/** @typedef {import('../schema.js').PlaylistID} PlaylistID */
/** @typedef {import('../schema.js').MediaID} MediaID */
/** @typedef {import('../schema.js').Playlist} Playlist */
/** @typedef {import('../schema.js').Media} Media */
/** @typedef {import('../plugins/playlists.js').PlaylistItemDesc} PlaylistItemDesc */

// TODO should be deprecated once the Web client uses the better single-source route.
/**
 * @type {import('../types.js').AuthenticatedController<never, SearchQuery, never>}
 */
async function searchAll(req) {
  const { user } = req;
  const { query } = req.query;
  const uw = req.uwave;
  const sourceNames = uw.sources.map((source) => source.type);
  const searches = uw.sources.map((source) => (
    source.search(user, query).catch((error) => {
      req.log.warn(error, { ns: 'uwave:search' });
      // Default to empty search on failure, for now.
      return [];
    })
  ));

  const searchResults = await Promise.all(searches);

  const combinedResults = Object.fromEntries(
    sourceNames.map((name, index) => [name, searchResults[index]]),
  );

  return combinedResults;
}

/**
 * @param {import('../Uwave.js').default} uw
 * @param {Map<MediaID, Media['sourceData']>} updates
 */
function updateSourceData(uw, updates) {
  return uw.db.transaction().execute(async (tx) => {
    uw.logger.debug({ ns: 'uwave:search', forMedia: [...updates.keys()] }, 'updating source data');
    for (const [id, sourceData] of updates.entries()) {
      await tx.updateTable('media')
        .where('id', '=', id)
        .set({ sourceData: sourceData == null ? null : jsonb(sourceData) })
        .executeTakeFirst();
    }
  });
}

/**
 * @typedef {object} SearchParams
 * @prop {string} source
 * @typedef {object} SearchQuery
 * @prop {string} query
 * @prop {string} [include]
 */

/**
 * @type {import('../types.js').AuthenticatedController<SearchParams, SearchQuery, never>}
 */
async function search(req) {
  const { user } = req;
  const { source: sourceName } = req.params;
  const { query, include } = req.query;
  const uw = req.uwave;
  const db = uw.db;

  const source = uw.source(sourceName);
  if (!source) {
    throw new SourceNotFoundError({ name: sourceName });
  }

  /** @type {(PlaylistItemDesc & { inPlaylists?: Playlist[] })[]} */
  const searchResults = await source.search(user, query);

  const searchResultsByID = new Map();
  searchResults.forEach((result) => {
    searchResultsByID.set(result.sourceID, result);
  });

  // Track medias whose `sourceData` property no longer matches that from the source.
  // This can happen because the media was actually changed, but also because of new
  // features in the source implementation.
  /** @type {Map<MediaID, Media['sourceData']>} */
  const mediasNeedSourceDataUpdate = new Map();

  const mediasInSearchResults = await db.selectFrom('media')
    .select([
      'id',
      'sourceType',
      'sourceID',
      (eb) => json(eb.fn.coalesce(eb.ref('sourceData'), jsonb(null))).as('sourceData'),
    ])
    .where('sourceType', '=', sourceName)
    .where('sourceID', 'in', Array.from(searchResultsByID.keys()))
    .execute();

  /** @type {Map<string, typeof mediasInSearchResults[0]>} */
  const mediaBySourceID = new Map();
  mediasInSearchResults.forEach((media) => {
    mediaBySourceID.set(media.sourceID, media);

    const freshMedia = searchResultsByID.get(media.sourceID);
    if (freshMedia && !isEqual(media.sourceData, freshMedia.sourceData)) {
      mediasNeedSourceDataUpdate.set(media.id, freshMedia.sourceData);
    }
  });

  // don't wait for this to complete
  updateSourceData(uw, mediasNeedSourceDataUpdate).catch((error) => {
    uw.logger.error({ ns: 'uwave:search', err: error }, 'sourceData update failed');
  });

  // Only include related playlists if requested
  if (typeof include === 'string' && include.split(',').includes('playlists')) {
    const playlistsByMediaID = await uw.playlists.getPlaylistsContainingAnyMedia(
      mediasInSearchResults.map((media) => media.id),
      { author: user.id },
    ).catch((error) => {
      uw.logger.error({ ns: 'uwave:search', err: error }, 'playlists containing media lookup failed');
      // just omit the related playlists if we timed out or crashed
      return new Map();
    });

    searchResults.forEach((result) => {
      const media = mediaBySourceID.get(String(result.sourceID));
      if (media) {
        result.inPlaylists = playlistsByMediaID.get(media.id);
      }
    });

    return toListResponse(searchResults, {
      url: req.fullUrl,
      included: {
        playlists: ['inPlaylists'],
      },
    });
  }

  return toListResponse(searchResults, {
    url: req.fullUrl,
  });
}

export {
  search,
  searchAll,
};
