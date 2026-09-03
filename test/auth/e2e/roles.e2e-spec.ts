import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../../src/database/prisma.service';
import { UserRole } from '../../../src/generated/prisma/client';
import { createTestApp } from '../../helpers/test-app';

describe('Role authorization flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const password = 'Password123';
  const usernames = {
    admin: `roles_admin_${suffix}`,
    superuser: `roles_super_${suffix}`,
    user: `roles_user_${suffix}`,
  };
  const tokens: Record<keyof typeof usernames, string> = {
    admin: '',
    superuser: '',
    user: '',
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    for (const roleName of Object.keys(usernames) as Array<
      keyof typeof usernames
    >) {
      const username = usernames[roleName];
      const registration = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ username, email: `${username}@example.com`, password })
        .expect(201);

      if (roleName !== 'user') {
        await prisma.user.update({
          where: { id: registration.body.id as string },
          data: {
            role: roleName === 'admin' ? UserRole.ADMIN : UserRole.SUPERUSER,
          },
        });
      }

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username, password })
        .expect(201);
      tokens[roleName] = login.body.auth_token as string;
    }
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { title: { contains: suffix } } });
    await prisma.user.deleteMany({
      where: { username: { in: Object.values(usernames) } },
    });
    await app.close();
  });

  async function createProduct(label: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${tokens.user}`)
      .send({
        title: `Role ${label} ${suffix}`,
        price: '10.00',
        description: 'Role authorization E2E product',
        quantity: 1,
      })
      .expect(201);

    return response.body.id as string;
  }

  it('allows ADMIN to access an ADMIN-protected endpoint', async () => {
    const productId = await createProduct('admin');

    await request(app.getHttpServer())
      .delete(`/products/${productId}`)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
  });

  it('allows SUPERUSER when the endpoint accepts ADMIN or SUPERUSER', async () => {
    const productId = await createProduct('superuser');

    await request(app.getHttpServer())
      .delete(`/products/${productId}`)
      .set('Authorization', `Bearer ${tokens.superuser}`)
      .expect(200);
  });

  it('rejects USER from an ADMIN-protected endpoint', async () => {
    const productId = await createProduct('user-denied');

    await request(app.getHttpServer())
      .delete(`/products/${productId}`)
      .set('Authorization', `Bearer ${tokens.user}`)
      .expect(403);
  });

  it('allows an authenticated USER on a route without role metadata', async () => {
    await createProduct('user-allowed');
  });

  it('rejects unauthenticated access before role authorization', async () => {
    const productId = await createProduct('unauthenticated');

    await request(app.getHttpServer())
      .delete(`/products/${productId}`)
      .expect(403);
  });
});
