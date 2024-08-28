import supertest from 'supertest';
import createUwave from './utils/createUwave.mjs';

describe('Users', () => {
  let user;
  let uw;
  beforeEach(async () => {
    uw = await createUwave('bans');
    user = await uw.test.createUser();
  });
  afterEach(async () => {
    await uw.destroy();
  });

  describe('GET /api/users', () => {
    it('requires authentication', async () => {
      await supertest(uw.server)
        .get('/api/users')
        .expect(401);
    });

    it('requires the users.list role', async () => {
      const token = await uw.test.createTestSessionToken(user);

      await supertest(uw.server)
        .get('/api/users')
        .set('Cookie', `uwsession=${token}`)
        .expect(403);

      await uw.acl.createRole('lister', ['users.list']);
      await uw.acl.allow(user, ['lister']);

      await supertest(uw.server)
        .get('/api/users')
        .set('Cookie', `uwsession=${token}`)
        .expect(200);
    });
  });
});
