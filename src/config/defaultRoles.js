const admin = ['*'];

/** @type {string[]} */
const guest = [];

const user = [
  'waitlist.join',
  'waitlist.leave',
  'booth.skip.self',
  'booth.vote',
  'chat.send',
  'chat.mention.staff',
];

const moderator = [
  ...user,
  'waitlist.add',
  'waitlist.remove',
  'waitlist.move',
  'waitlist.lock',
  'waitlist.join.locked',
  'booth.skip.other',
  'chat.delete',
  'chat.mute',
  'chat.unmute',
  'chat.mention.djs',
  'users.list',
  'users.bans.list',
  'users.bans.add',
  'users.bans.remove',
];

const manager = [
  ...moderator,
  'waitlist.clear',
  'chat.mention.everyone',
  'motd.set',
];

/** @typedef {Record<string, import("../schema").Permission[]>} PermissionMap */

export default /** @type {PermissionMap} */ (/** @type {Record<string, unknown[]>} */ ({
  admin,
  manager,
  moderator,
  special: user,
  user,
  guest,
}));
