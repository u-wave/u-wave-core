/**
 * @param {import('../Uwave.js').default} uw
 * @param {import('../schema.js').UserID} userID
 */
async function removeFromWaitlist(uw, userID) {
  const waitingIDs = await uw.waitlist.getUserIDs();
  if (waitingIDs.includes(userID)) {
    await uw.redis.lrem('waitlist', 0, userID);
    uw.publish('waitlist:leave', {
      userID,
      waitlist: await uw.waitlist.getUserIDs(),
    });
  }
}

export default removeFromWaitlist;
