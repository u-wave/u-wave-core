import type { Generated } from 'kysely';
import type { JsonObject, Opaque } from 'type-fest';

export type UserID = Opaque<string, 'UserID'>;
export type MediaID = Opaque<string, 'MediaID'>;
export type PlaylistID = Opaque<string, 'PlaylistID'>;
export type PlaylistItemID = Opaque<string, 'PlaylistItemID'>;
export type HistoryEntryID = Opaque<string, 'HistoryEntryID'>;

type Selected<T> = {
  [K in keyof T]: T[K] extends Generated<infer Inner> ? Inner : T[K];
} & {};

export type Media = Selected<MediaTable>;
export interface MediaTable {
  id: Generated<MediaID>,
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

export type User = Selected<UserTable>;
export interface UserTable {
  id: Generated<UserID>,
  username: string,
  slug: string,
  activePlaylistID: PlaylistID | null,
  pendingActivation: boolean,
  createdAt: Date,
  updatedAt: Date,
}

export type Playlist = Selected<PlaylistTable>;
export interface PlaylistTable {
  id: Generated<PlaylistID>,
  userID: UserID,
  name: string,
  createdAt: Date,
  updatedAt: Date,
}

export type PlaylistItem = Selected<PlaylistItemTable>;
export interface PlaylistItemTable {
  id: Generated<PlaylistItemID>,
  playlistID: PlaylistID,
  mediaID: MediaID,
  artist: string,
  title: string,
  start: number,
  end: number,
  createdAt: Date,
  updatedAt: Date,
}

export type HistoryEntry = Selected<HistoryEntryTable>;
export interface HistoryEntryTable {
  id: Generated<HistoryEntryID>,
  userID: UserID,
  mediaID: MediaID,
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
