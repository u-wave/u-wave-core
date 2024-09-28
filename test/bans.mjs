import assert from 'assert';
import supertest from 'supertest';
import * as sinon from 'sinon';
import ms from 'ms';
import createUwave from './utils/createUwave.mjs';

describe('Bans', () => {
  let user;
  let uw;
  beforeEach(async () => {
    uw = await createUwave('bans');
    user = await uw.test.createUser();
  });
  afterEach(async () => {
    await uw.destroy();
  });

  describe('isBanned(user)', () => {
    it('returns false for unbanned users', async () => {
      assert.strictEqual(await uw.bans.isBanned(user), false);
    });
    it('returns true for banned users', async () => {
      const moderator = await uw.test.createUser();
      await uw.bans.ban(user, { moderator, permanent: true, duration: 0 });
      assert.strictEqual(await uw.bans.isBanned(user), true);
    });
  });

  describe('ban() and unban()', () => {
    it('can ban and unban a user', async () => {
      const moderator = await uw.test.createUser();
      assert.strictEqual(await uw.bans.isBanned(user), false);
      await uw.bans.ban(user, {
        moderator,
        duration: ms('10 hours'),
      });
      assert.strictEqual(await uw.bans.isBanned(user), true);

      await uw.bans.unban(user.id, { moderator });
      assert.strictEqual(await uw.bans.isBanned(user), false);
    });
  });

  describe('GET /bans', () => {
    it('requires authentication', async () => {
      await supertest(uw.server)
        .get('/api/bans')
        .expect(401);
    });

    it('requires the users.bans.list role', async () => {
      const token = await uw.test.createTestSessionToken(user);
      await uw.acl.createRole('testBans', ['users.bans.list']);

      await supertest(uw.server)
        .get('/api/bans')
        .set('Cookie', `uwsession=${token}`)
        .expect(403);

      await uw.acl.allow(user, ['testBans']);

      await supertest(uw.server)
        .get('/api/bans')
        .set('Cookie', `uwsession=${token}`)
        .expect(200);
    });

    it('returns bans', async () => {
      const token = await uw.test.createTestSessionToken(user);
      await uw.acl.createRole('testBans', ['users.bans.list', 'users.bans.add']);
      await uw.acl.allow(user, ['testBans']);

      const bannedUser = await uw.test.createUser();
      await uw.bans.ban(bannedUser, {
        moderator: user,
        duration: ms('10 hours'),
        reason: 'just to test',
      });

      const res = await supertest(uw.server)
        .get('/api/bans')
        .set('Cookie', `uwsession=${token}`)
        .expect(200);

      assert.strictEqual(res.body.meta.results, 1);
      sinon.assert.match(res.body.data[0], {
        duration: ms('10 hours'),
        expiresAt: sinon.match.string,
        reason: 'just to test',
        moderator: user.id,
        user: bannedUser.id,
      });
    });
  });
});
