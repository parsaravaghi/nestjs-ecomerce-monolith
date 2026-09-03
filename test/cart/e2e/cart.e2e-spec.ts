import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../../src/database/prisma.service';
import { createTestApp } from '../../helpers/test-app';

describe('Cart user flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let userId: string;
  let productId: string;
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const username = `cart_e2e_${suffix}`;

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
    userId = registration.body.id as string;
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'Password123' })
      .expect(201);
    token = login.body.auth_token as string;
    const product = await prisma.product.create({
      data: {
        title: `Cart E2E product ${suffix}`,
        description: 'Cart E2E stock',
        price: '20.00',
        quantity: 5,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await app.close();
  });

  it('requires authentication, lazily creates, and reuses the user cart', async () => {
    await request(app.getHttpServer()).get('/cart').expect(403);
    const first = await request(app.getHttpServer())
      .get('/cart?limit=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/cart?limit=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(first.body.id).toBe(second.body.id);
    expect(first.body.userId).toBe(userId);
    expect(first.body.items).toEqual([]);
    expect(first.body.pagination.limit).toBe(1);
  });

  it('rejects invalid pagination input', async () => {
    await request(app.getHttpServer())
      .get('/cart?limit=0')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/cart?cursor=not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('validates POST input and requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/cart')
      .send({ productId, quantity: 1 })
      .expect(403);
    await request(app.getHttpServer())
      .post('/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 1 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 0 })
      .expect(400);
  });

  it('adds and increases an item, then GET returns the invalidated cart page', async () => {
    await request(app.getHttpServer())
      .get('/cart')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 2 })
      .expect(201)
      .expect((response) => expect(response.body.quantity).toBe(2));
    await request(app.getHttpServer())
      .post('/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 1 })
      .expect(201)
      .expect((response) => expect(response.body.quantity).toBe(3));
    await request(app.getHttpServer())
      .get('/cart')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.price).toBe('60');
        expect(response.body.items).toEqual([
          expect.objectContaining({ quantity: 3 }),
        ]);
      });
  });

  it('rejects missing products and quantities above stock', async () => {
    await request(app.getHttpServer())
      .post('/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productId: '550e8400-e29b-41d4-a716-446655440099',
        quantity: 1,
      })
      .expect(404);
    await request(app.getHttpServer())
      .post('/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 3 })
      .expect(400);
  });

  it('removes the product, invalidates GET cache, and returns 404 if repeated', async () => {
    await request(app.getHttpServer()).delete(`/cart/${productId}`).expect(403);
    await request(app.getHttpServer())
      .delete(`/cart/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect({ deleted: true });
    await request(app.getHttpServer())
      .get('/cart')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.price).toBe('0');
        expect(response.body.items).toEqual([]);
      });
    await request(app.getHttpServer())
      .delete(`/cart/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
