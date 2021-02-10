'use strict';

const { ObjectId } = require('mongoose').mongo;
const { zip } = require('lodash');

async function up({ context: uw }) {
  const { User } = uw.models;

  const ops = [];
  for await (const keys of uw.redis.scanStream({ match: 'playlist:*' })) {
    const values = await uw.redis.mget(keys);
    for (const [key, value] of zip(keys, values)) {
      ops.push({
        updateOne: {
          filter: { _id: new ObjectId(key) },
          update: {
            $set: { activePlaylist: new ObjectId(value) },
          },
        },
      });
    }
    await uw.redis.unlink(keys);
  }

  await User.bulkWrite(ops);
}

async function down({ context: uw }) {
  const { User } = uw.models;

  const users = User.find({ activePlaylist: { $ne: null } });

  for await (const user of users.stream()) {
    if (!user.activePlaylist) return;

    await uw.redis.set(`playlist:${user.id}`, user.activePlaylist.toString());
  }
}

module.exports = { up, down };
