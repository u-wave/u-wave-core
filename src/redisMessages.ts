import type { JsonObject } from 'type-fest'; // eslint-disable-line n/no-missing-import, n/no-unpublished-import
import type { HistoryEntryID, PlaylistID, UserID } from './schema.js';

export type ServerActionParameters = {
  'advance:complete': {
    historyID: HistoryEntryID,
    userID: UserID,
    playlistID: PlaylistID,
    media: {
      artist: string,
      title: string,
      start: number,
      end: number,
      media: {
        sourceType: string,
        sourceID: string,
        artist: string,
        title: string,
        sourceData: JsonObject,
      }
    },
    playedAt: number,
  } | null,

  'booth:skip': {
    userID: UserID,
    moderatorID: UserID | null,
    reason: string | null,
  },
  'booth:replace': {
    userID: UserID,
    moderatorID: UserID | null,
  },

  'chat:message': {
    id: string,
    userID: UserID,
    message: string,
    timestamp: number,
  },
  'chat:delete': {
    filter: { id: string } | { userID: UserID } | Record<string, never>,
    moderatorID: UserID | null,
  },
  'chat:mute': {
    moderatorID: UserID,
    userID: UserID,
    duration: number,
  },
  'chat:unmute': {
    moderatorID: UserID,
    userID: UserID,
  },

  'configStore:update': {
    key: string,
    user: UserID | null,
    patch: Record<string, import('type-fest').JsonValue>,
  },

  'booth:vote': {
    userID: UserID,
    direction: 1 | -1,
  },
  'booth:favorite': {
    userID: UserID,
    playlistID: PlaylistID,
  },
  'playlist:cycle': {
    userID: UserID,
    playlistID: PlaylistID,
  },
  'waitlist:join': {
    userID: UserID,
    waitlist: UserID[],
  },
  'waitlist:leave': {
    userID: UserID,
    waitlist: UserID[],
  },
  'waitlist:add': {
    userID: UserID,
    moderatorID: UserID,
    position: number,
    waitlist: UserID[],
  },
  'waitlist:remove': {
    userID: UserID,
    moderatorID: UserID,
    waitlist: UserID[],
  },
  'waitlist:move': {
    userID: UserID,
    moderatorID: UserID,
    position: number,
    waitlist: UserID[],
  },
  'waitlist:update': UserID[],
  'waitlist:clear': {
    moderatorID: UserID,
  },
  'waitlist:lock': {
    moderatorID: UserID,
    locked: boolean,
  },
  'acl:allow': {
    userID: UserID,
    roles: string[],
  },
  'acl:disallow': {
    userID: UserID,
    roles: string[],
  },
  'user:create': {
    user: UserID,
    auth: { type: 'local', email: string } | { type: string, id: string },
  },
  'user:update': {
    userID: UserID,
    moderatorID: UserID | null,
    old: Record<string, string>,
    new: Record<string, string>,
  },
  'user:join': { userID: UserID },
  'user:leave': { userID: UserID },
  'user:logout': { userID: UserID },
  'user:ban': {
    userID: UserID,
    moderatorID: UserID,
    permanent?: boolean,
    duration: number | null,
    expiresAt: number | null,
  },
  'user:unban': {
    userID: UserID,
    moderatorID: UserID,
  },
  'http-api:socket:close': string,

  'emotes:reload': null,
};

export type ServerActions = {
  [Name in keyof ServerActionParameters]?: (parameter: ServerActionParameters[Name]) => void
};
