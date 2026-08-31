import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../../src/database/prisma.service';
import { createTestApp } from '../../helpers/test-app';

describe('Authentication user flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const username = `auth_e2e_${suffix}`;
  const email = `${username}@example.com`;
  const password = 'Password123';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username } });
    await app.close();
  });

  it('registers, logs in, and reads the verified user profile', async () => {
    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, email, password })
      .expect(201);
    expect(registration.body).not.toHaveProperty('password');

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password })
      .expect(201);
    expect(login.body.auth_token).toEqual(expect.any(String));

    await request(app.getHttpServer()).get('/auth/me').expect(403);

    const profile = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.auth_token}`)
      .expect(200);
    expect(profile.body).toEqual(
      expect.objectContaining({
        sub: registration.body.id,
        username,
        iat: expect.any(Number),
        exp: expect.any(Number),
      }),
    );
  });
});
