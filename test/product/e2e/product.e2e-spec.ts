import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../../src/database/prisma.service';
import { createTestApp } from '../../helpers/test-app';
import { UserRole } from '../../../src/generated/prisma/client';

describe('Product user flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const username = `product_e2e_${suffix}`;
  const title = `E2E product ${suffix}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123',
      })
      .expect(201);
    await prisma.user.update({
      where: { id: registration.body.id as string },
      data: { role: UserRole.ADMIN },
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'Password123' })
      .expect(201);
    token = login.body.auth_token as string;
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { title } });
    await prisma.user.deleteMany({ where: { username } });
    await app.close();
  });

  it('requires authentication and completes create/read/update/delete', async () => {
    const payload = {
      title,
      price: '49.90',
      description: 'E2E product',
      quantity: 7,
    };
    await request(app.getHttpServer())
      .post('/products')
      .send(payload)
      .expect(403);

    const creation = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);
    expect(creation.body).toEqual(
      expect.objectContaining({ title, price: '49.9', quantity: 7 }),
    );

    await request(app.getHttpServer())
      .get(`/products/${creation.body.id}`)
      .expect(200)
      .expect((response) => expect(response.body.title).toBe(title));

    await request(app.getHttpServer())
      .put(`/products/${creation.body.id}`)
      .send({ price: '59.90' })
      .expect(200)
      .expect((response) => {
        expect(response.body.price).toBe('59.9');
        expect(response.body.description).toBe(payload.description);
        expect(response.body.quantity).toBe(7);
      });

    await request(app.getHttpServer())
      .get('/products?limit=1')
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toEqual(expect.any(Array));
        expect(response.body).toHaveProperty('nextCursor');
      });

    await request(app.getHttpServer())
      .delete(`/products/${creation.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/products/${creation.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/products/${creation.body.id}`)
      .expect(404);
  });

  it('rejects a price outside Decimal(18,2) before querying Prisma', async () => {
    await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: `${title} overflow`,
        price: '10000000000000000.00',
        description: 'Invalid price',
        quantity: 1,
      })
      .expect(400);
  });
});
