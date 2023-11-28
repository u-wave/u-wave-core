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
  artist: string,
  title: string,
  start: number,
  end: number,
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
