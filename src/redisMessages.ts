import { JsonObject } from 'type-fest'; // eslint-disable-line import/no-unresolved, n/no-missing-import, n/no-unpublished-import

export type ServerActionParameters = {
  'advance:complete': {
    historyID: string,
    userID: string,
    playlistID: string,
    itemID: string,
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
    userID: string,
    moderatorID: string | null,
    reason: string | null,
  },
  'booth:replace': {
    userID: string,
    moderatorID: string | null,
  },

  'chat:message': {
    id: string,
    userID: string,
    message: string,
    timestamp: number,
  },
  'chat:delete': {
    filter: { id: string } | { userID: string } | Record<string, never>,
    moderatorID: string,
  },
  'chat:mute': {
    moderatorID: string,
    userID: string,
    duration: number,
  },
  'chat:unmute': {
    moderatorID: string,
    userID: string,
  },

  'configStore:update': {
    key: string,
    user: string | null,
    patch: Record<string, import('type-fest').JsonValue>,
  },

  'booth:vote': {
    userID: string,
    direction: 1 | -1,
  },
  'booth:favorite': {
    userID: string,
    playlistID: string,
  },
  'playlist:cycle': {
    userID: string,
    playlistID: string,
  },
  'waitlist:join': {
    userID: string,
    waitlist: string[],
  },
  'waitlist:leave': {
    userID: string,
    waitlist: string[],
  },
  'waitlist:add': {
    userID: string,
    moderatorID: string,
    position: number,
    waitlist: string[],
  },
  'waitlist:remove': {
    userID: string,
    moderatorID: string,
    waitlist: string[],
  },
  'waitlist:move': {
    userID: string,
    moderatorID: string,
    position: number,
    waitlist: string[],
  },
  'waitlist:update': string[],
  'waitlist:clear': {
    moderatorID: string,
  },
  'waitlist:lock': {
    moderatorID: string,
    locked: boolean,
  },
  'acl:allow': {
    userID: string,
    roles: string[],
  },
  'acl:disallow': {
    userID: string,
    roles: string[],
  },
  'user:create': {
    user: string,
    auth: { type: 'local', email: string } | { type: string, id: string },
  },
  'user:update': {
    userID: string,
    moderatorID: string,
    old: Record<string, string>,
    new: Record<string, string>,
  },
  'user:join': { userID: string },
  'user:leave': { userID: string },
  'user:logout': { userID: string },
  'user:ban': {
    userID: string,
    moderatorID: string,
    permanent?: boolean,
    duration: number | null,
    expiresAt: number | null,
  },
  'user:unban': {
    userID: string,
    moderatorID: string,
  },
  'http-api:socket:close': string,

  'emotes:reload': null,
};

export type ServerActions = {
  [Name in keyof ServerActionParameters]?: (parameter: ServerActionParameters[Name]) => void
};
