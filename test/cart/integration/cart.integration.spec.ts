import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../../src/database/prisma.service';
import { CartService } from '../../../src/modules/cart/cart.service';
import { createTestApp } from '../../helpers/test-app';

describe('Cart module database integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cartService: CartService;
  let userId: string;
  let productId: string;
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    cartService = app.get(CartService);
    const user = await prisma.user.create({
      data: {
        username: `cart_integration_${suffix}`,
        email: `cart_integration_${suffix}@example.com`,
        password: 'integration-only-hash',
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        title: `Cart integration product ${suffix}`,
        description: 'Cart integration stock',
        price: '12.50',
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

  it('lazily creates exactly one zero-price cart for a user', async () => {
    const first = await cartService.getCart(userId, { limit: 20 });
    await cartService.invalidateUserCartCache(userId);
    const second = await cartService.getCart(userId, { limit: 20 });
    const carts = await prisma.cart.findMany({ where: { userId } });

    expect(second.id).toBe(first.id);
    expect(carts).toHaveLength(1);
    expect(carts[0].price.toString()).toBe('0');
  });

  it('creates one related item, increases its quantity, and updates total price', async () => {
    const first = await cartService.addToCart(userId, {
      productId,
      quantity: 2,
    });
    const second = await cartService.addToCart(userId, {
      productId,
      quantity: 1,
    });
    const cart = await prisma.cart.findUniqueOrThrow({
      where: { userId },
      include: { items: { include: { product: true } } },
    });

    expect(first.productId).toBe(productId);
    expect(second.quantity).toBe(3);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].product.id).toBe(productId);
    expect(cart.items[0].quantity).toBe(3);
    expect(cart.price.toString()).toBe('37.5');
  });

  it('rejects missing products and quantities above remaining cart capacity', async () => {
    await expect(
      cartService.addToCart(userId, {
        productId: '550e8400-e29b-41d4-a716-446655440099',
        quantity: 1,
      }),
    ).rejects.toThrow('Product not found');
    await expect(
      cartService.addToCart(userId, { productId, quantity: 3 }),
    ).rejects.toThrow('Total cart quantity exceeds product stock');
  });
});
