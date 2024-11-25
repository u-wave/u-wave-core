// Validations for authentication routes:

export const register = /** @type {const} */ ({
  body: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        format: 'email',
      },
      username: {
        $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/Username',
      },
      password: {
        type: 'string',
        minLength: 6,
      },
      grecaptcha: { type: 'string', nullable: true },
    },
    required: ['email', 'username', 'password'],
  },
});

export const login = /** @type {const} */ ({
  query: {
    type: 'object',
    properties: {
      session: {
        type: 'string',
        enum: ['token', 'cookie'],
        default: 'token',
      },
    },
  },
  body: {
    type: 'object',
    properties: {
      // This is less strict than the email and password validation used in
      // `register`, because we check this against the DB anyway, and an
      // error message about a nonexistent account or mismatching passwords
      // makes more sense when logging in than an error message about the
      // email being incorrectly formatted or the password being too short.
      email: {
        type: 'string',
        minLength: 1,
      },
      password: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['email', 'password'],
  },
});

export const requestPasswordReset = /** @type {const} */ ({
  body: {
    type: 'object',
    properties: {
      // Checked against DB like in `login`.
      email: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['email'],
  },
});

export const passwordReset = /** @type {const} */ ({
  params: {
    type: 'object',
    properties: {
      // Technically should be a specific length, but
      // we can let the controller take care of that.
      reset: { type: 'string', minLength: 1 },
    },
    required: ['reset'],
  },
  body: {
    type: 'object',
    properties: {
      password: {
        type: 'string',
        minLength: 6,
      },
    },
    required: ['password'],
  },
});

// Validations for ACL routes:

export const createAclRole = /** @type {const} */ ({
  params: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
    },
    required: ['name'],
  },
  body: {
    type: 'object',
    properties: {
      permissions: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['permissions'],
  },
});

export const deleteAclRole = /** @type {const} */ ({
  params: {
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
    required: ['name'],
  },
});

// Validations for booth routes:

export const skipBooth = /** @type {const} */ ({
  body: {
    type: 'object',
    properties: {
      reason: { type: 'string' },
      userID: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
      remove: { type: 'boolean', default: false },
    },
    dependentRequired: {
      reason: ['userID'],
      userID: ['reason'],
    },
  },
});

export const leaveBooth = /** @type {const} */ ({
  body: {
    type: 'object',
    properties: {
      userID: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
      autoLeave: { type: 'boolean', default: true },
    },
  },
});

export const getVote = /** @type {const} */ ({
  params: {
    type: 'object',
    properties: {
      historyID: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
    },
    required: ['historyID'],
  },
});

export const vote = /** @type {const} */ ({
  params: {
    type: 'object',
    properties: {
      historyID: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
    },
    required: ['historyID'],
  },
  body: {
    type: 'object',
    properties: {
      direction: { enum: [-1, 1] },
    },
    required: ['direction'],
  },
});

export const favorite = /** @type {const} */ ({
  body: {
    type: 'object',
    properties: {
      playlistID: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
      historyID: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
    },
    required: ['playlistID', 'historyID'],
  },
});

export const getRoomHistory = /** @type {const} */ ({
  query: {
    anyOf: [
      {
        oneOf: [
          { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/Pagination' },
          { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/LegacyPagination' },
        ],
      },
      {
        type: 'object',
        properties: {
          filter: {
            type: 'object',
            properties: {
              media: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
            },
          },
        },
      },
    ],
  },
});

// Validations for chat routes:

export const deleteChatByUser = /** @type {const} */ ({
  params: {
    type: 'object',
    properties: {
      id: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
    },
    required: ['id'],
  },
});

export const deleteChatMessage = /** @type {const} */ ({
  params: {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
    },
    required: ['id'],
  },
});

// Validations for MOTD routes:

export const setMotd = /** @type {const} */ ({
  body: {
    type: 'object',
    properties: {
      // `null` to remove the MOTD.
      motd: { type: ['string', 'null'] },
    },
    required: ['motd'],
  },
});

// Validations for playlist routes:

const playlistParams = /** @type {const} */ ({
  type: 'object',
  properties: {
    id: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
  },
  required: ['id'],
});

const playlistItemParams = /** @type {const} */ ({
  type: 'object',
  properties: {
    id: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
    itemID: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
  },
  required: ['id', 'itemID'],
});

export const getPlaylists = /** @type {const} */ ({
  query: {
    type: 'object',
    properties: {
      contains: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
    },
  },
});

export const createPlaylist = /** @type {const} */ ({
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
    },
    required: ['name'],
  },
});

export const getPlaylist = /** @type {const} */ ({
  params: playlistParams,
});

export const deletePlaylist = /** @type {const} */ ({
  params: playlistParams,
});

export const updatePlaylist = /** @type {const} */ ({
  params: playlistParams,
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      description: { type: 'string' },
    },
  },
});

export const renamePlaylist = /** @type {const} */ ({
  params: playlistParams,
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
    },
    required: ['name'],
  },
});

export const getPlaylistItems = /** @type {const} */ ({
  params: playlistParams,
  query: {
    type: 'object',
    if: {
      properties: { page: true },
    },
    then: {
      oneOf: [
        { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/Pagination' },
        { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/LegacyPagination' },
      ],
    },
  },
});

export const addPlaylistItems = /** @type {const} */ ({
  params: playlistParams,
  body: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sourceType: { type: 'string' },
            sourceID: {
              oneOf: [{ type: 'string' }, { type: 'number' }],
            },
            artist: { type: 'string' },
            title: { type: 'string' },
          },
          required: ['sourceType', 'sourceID'],
        },
      },
    },
    required: ['items'],

    // Different ways to describe the insert position
    oneOf: [
      {
        type: 'object',
        properties: {
          after: {
            oneOf: [
              { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
              { const: null },
              { const: -1 },
            ],
          },
        },
        required: ['after'],
      },
      {
        type: 'object',
        properties: {
          at: { enum: ['start', 'end'] },
        },
        required: ['at'],
      },
    ],
  },
});

export const removePlaylistItems = /** @type {const} */ ({
  params: playlistParams,
  body: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
      },
    },
    required: ['items'],
  },
});

export const movePlaylistItems = /** @type {const} */ ({
  params: playlistParams,
  body: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
      },
    },
    required: ['items'],
    // Different ways to describe the insert position
    oneOf: [
      {
        type: 'object',
        properties: {
          after: {
            oneOf: [
              { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
              { const: null },
              { const: -1 },
            ],
          },
        },
        required: ['after'],
      },
      {
        type: 'object',
        properties: {
          at: { enum: ['start', 'end'] },
        },
        required: ['at'],
      },
    ],
  },
});

export const shufflePlaylistItems = /** @type {const} */ ({
  params: playlistParams,
});

export const getPlaylistItem = /** @type {const} */ ({
  params: playlistItemParams,
});

export const updatePlaylistItem = /** @type {const} */ ({
  params: playlistItemParams,
  body: {
    type: 'object',
    properties: {
      artist: { type: 'string' },
      title: { type: 'string' },
      start: { type: 'integer', minimum: 0 },
      end: { type: 'integer', minimum: 0 },
    },
  },
});

export const removePlaylistItem = /** @type {const} */ ({
  params: playlistItemParams,
});

// Validations for search routes:

export const searchAll = /** @type {const} */ ({
  query: {
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
    required: ['query'],
  },
});

export const search = /** @type {const} */ ({
  query: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      include: { type: 'string', nullable: true },
    },
    required: ['query'],
  },
  params: {
    type: 'object',
    properties: {
      source: { type: 'string', minLength: 1 },
    },
    required: ['source'],
  },
});

// Validations for user routes:

const userParams = /** @type {const} */ ({
  type: 'object',
  properties: {
    id: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
  },
  required: ['id'],
});

export const getUser = /** @type {const} */ ({
  params: userParams,
});

export const muteUser = /** @type {const} */ ({
  params: userParams,
  body: {
    type: 'object',
    properties: {
      time: { type: 'integer', minimum: 0 },
    },
    required: ['time'],
  },
});

export const unmuteUser = /** @type {const} */ ({
  params: userParams,
});

export const addUserRole = /** @type {const} */ ({
  params: {
    type: 'object',
    properties: {
      id: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
      role: { type: 'string' },
    },
    required: ['id', 'role'],
  },
});

export const removeUserRole = /** @type {const} */ ({
  params: {
    type: 'object',
    properties: {
      id: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
      role: { type: 'string' },
    },
    required: ['id', 'role'],
  },
});

export const setUserName = /** @type {const} */ ({
  params: userParams,
  body: {
    type: 'object',
    properties: {
      username: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/Username' },
    },
    required: ['username'],
  },
});

export const setUserAvatar = /** @type {const} */ ({
  params: userParams,
  body: {
    type: 'object',
    properties: {
      avatar: { type: 'string' },
    },
    required: ['avatar'],
  },
});

export const setUserStatus = /** @type {const} */ ({
  params: userParams,
  body: {
    type: 'object',
    properties: {
      status: { type: 'integer' },
    },
    required: ['status'],
  },
});

export const getUserHistory = /** @type {const} */ ({
  params: userParams,
  query: {
    oneOf: [
      { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/Pagination' },
      { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/LegacyPagination' },
      true,
    ],
  },
});

// Validations for Waitlist routes:

export const joinWaitlist = /** @type {const} */ ({
  body: {
    type: 'object',
    properties: {
      userID: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
    },
    required: ['userID'],
  },
});

export const moveWaitlist = /** @type {const} */ ({
  body: {
    type: 'object',
    properties: {
      userID: { $ref: 'https://ns.u-wave.net/schemas/definitions.json#/definitions/UUID' },
      position: {
        type: 'integer',
        minimum: 0,
      },
    },
    required: ['userID', 'position'],
  },
});

export const lockWaitlist = /** @type {const} */ ({
  body: {
    type: 'object',
    properties: {
      lock: { type: 'boolean' },
    },
    required: ['lock'],
  },
});
