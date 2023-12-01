import type { Generated } from 'kysely';
import type { JsonObject } from 'type-fest';

export interface MediaTable {
  id: Generated<string>,
  sourceID: string,
  sourceType: string,
  sourceData: JsonObject | null,
  artist: string,
  title: string,
  duration: number,
  thumbnail: string,
  createdAt: Date,
  updatedAt: Date,
}

export interface UserTable {
  id: Generated<string>,
  username: string,
  slug: string,
  activePlaylistID: string,
  pendingActivation: boolean,
  createdAt: Date,
  updatedAt: Date,
}

export interface PlaylistTable {
  id: Generated<string>,
  userID: string,
  name: string,
  createdAt: Date,
  updatedAt: Date,
}

export interface PlaylistItemTable {
  id: Generated<string>,
  playlistID: string,
  mediaID: string,
  artist: string,
  title: string,
  start: number,
  end: number,
  createdAt: Date,
  updatedAt: Date,
}

export interface HistoryEntryTable {
  id: Generated<string>,
  userID: string,
  mediaID: string,
  /** Snapshot of the media artist name at the time this entry was played. */
  artist: string,
  /** Snapshot of the media title at the time this entry was played. */
  title: string,
  /** Time to start playback at. */
  start: number,
  /** Time to stop playback at. */
  end: number,
  /** Arbitrary source-specific data required for media playback. */
  sourceData: JsonObject | null,
  createdAt: Date,
  updatedAt: Date,
}

export interface Database {
  media: MediaTable,
  users: UserTable,
  playlists: PlaylistTable,
  playlistItems: PlaylistItemTable,
  historyEntries: HistoryEntryTable,
}
