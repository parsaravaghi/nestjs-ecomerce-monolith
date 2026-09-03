import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../../src/database/prisma.service';
import { ProductService } from '../../../src/modules/product/product.service';
import { createTestApp } from '../../helpers/test-app';

describe('Product module database integration', () => {
  let app: INestApplication;
  let productService: ProductService;
  let prisma: PrismaService;
  let userId: string;
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const username = `product_integration_${suffix}`;
  const title = `Integration product ${suffix}`;

  beforeAll(async () => {
    app = await createTestApp();
    productService = app.get(ProductService);
    prisma = app.get(PrismaService);
    const user = await prisma.user.create({
      data: {
        username,
        email: `${username}@example.com`,
        password: 'integration-only-hash',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { title } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('persists and reads the Product-to-User relationship', async () => {
    const created = await productService.createProduct(
      {
        title,
        price: '99.95',
        description: 'Database integration',
        quantity: 6,
      },
      userId,
    );
    const stored = await prisma.product.findUniqueOrThrow({
      where: { id: created.id },
      include: { user: true },
    });

    expect(stored.userId).toBe(userId);
    expect(stored.user?.username).toBe(username);
    expect(stored.price.toString()).toBe('99.95');
    expect(stored.quantity).toBe(6);
  });
});
