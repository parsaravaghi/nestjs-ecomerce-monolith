import { jest } from '@jest/globals';
import { Cache } from 'cache-manager';
import { Prisma } from '../../../src/generated/prisma/client';
import { PrismaService } from '../../../src/database/prisma.service';
import {
  CartResponse,
  CartService,
} from '../../../src/modules/cart/cart.service';

describe('CartService', () => {
  const transaction = {
    cart: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    cartItem: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const prisma = {
    product: { findUnique: jest.fn() },
    cart: { upsert: jest.fn() },
    $transaction: jest.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const cache = {
    get: jest.fn(),
    set: jest.fn(),
  };
  const service = new CartService(
    prisma as unknown as PrismaService,
    cache as unknown as Cache,
  );
  const firstItemId = '550e8400-e29b-41d4-a716-446655440001';
  const extraItemId = '550e8400-e29b-41d4-a716-446655440002';
  const cart = {
    id: '550e8400-e29b-41d4-a716-446655440010',
    userId: '550e8400-e29b-41d4-a716-446655440020',
    price: new Prisma.Decimal(0),
    items: [firstItemId, extraItemId].map((id) => ({
      id,
      quantity: 1,
      product: {
        id: `650e8400-e29b-41d4-a716-${id.slice(-12)}`,
        title: 'Keyboard',
        price: new Prisma.Decimal('75.00'),
        description: 'Mechanical',
      },
    })),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const productId = '650e8400-e29b-41d4-a716-446655440030';
  const addedItem = {
    id: '750e8400-e29b-41d4-a716-446655440040',
    productId,
    quantity: 2,
    product: {
      id: productId,
      title: 'Keyboard',
      price: new Prisma.Decimal('75.00'),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cache.get.mockResolvedValue(undefined);
    cache.set.mockResolvedValue(undefined);
    prisma.cart.upsert.mockResolvedValue(cart);
    prisma.product.findUnique.mockResolvedValue({
      id: productId,
      price: new Prisma.Decimal('75.00'),
      quantity: 10,
    });
    transaction.cart.upsert.mockResolvedValue({ id: cart.id });
    transaction.cart.findUnique.mockResolvedValue({ id: cart.id });
    transaction.cartItem.findUnique.mockResolvedValue(null);
    transaction.cartItem.create.mockResolvedValue(addedItem);
    transaction.cartItem.update.mockResolvedValue(addedItem);
    transaction.cartItem.deleteMany.mockResolvedValue({ count: 1 });
    transaction.cartItem.findMany.mockResolvedValue([
      {
        quantity: 2,
        product: { price: new Prisma.Decimal('75.00') },
      },
    ]);
    transaction.cart.update.mockResolvedValue({ id: cart.id });
  });

  it('returns a cached page without querying Prisma', async () => {
    const cached = { id: cart.id } as CartResponse;
    cache.get.mockResolvedValueOnce('3').mockResolvedValueOnce(cached);

    await expect(service.getCart(cart.userId, { limit: 20 })).resolves.toBe(
      cached,
    );
    expect(prisma.cart.upsert).not.toHaveBeenCalled();
    expect(cache.get).toHaveBeenLastCalledWith(
      `cart:${cart.userId}:v:3:limit:20:cursor:first`,
    );
  });

  it('upserts a zero-price cart and paginates items on a cache miss', async () => {
    const response = await service.getCart(cart.userId, {
      limit: 1,
      cursor: firstItemId,
    });

    expect(prisma.cart.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: cart.userId },
        update: {},
        create: { userId: cart.userId, price: 0 },
        select: expect.objectContaining({
          items: expect.objectContaining({
            take: 2,
            cursor: { id: firstItemId },
            skip: 1,
            orderBy: { id: 'asc' },
          }),
        }),
      }),
    );
    expect(response.price).toBe('0');
    expect(response.items).toHaveLength(1);
    expect(response.pagination).toEqual({
      limit: 1,
      nextCursor: firstItemId,
      hasNextPage: true,
    });
    expect(cache.set).toHaveBeenCalledWith(
      `cart:${cart.userId}:v:1:limit:1:cursor:${firstItemId}`,
      response,
    );
  });

  it('changes the cache version used by all cart pages', async () => {
    await service.invalidateUserCartCache(cart.userId);

    expect(cache.set).toHaveBeenCalledWith(
      `cart-version:${cart.userId}`,
      expect.any(String),
    );
  });

  it('creates a cart item, recalculates price, and invalidates cache', async () => {
    const response = await service.addToCart(cart.userId, {
      productId,
      quantity: 2,
    });

    expect(prisma.product.findUnique).toHaveBeenCalledWith({
      where: { id: productId },
      select: { id: true, price: true, quantity: true },
    });
    expect(transaction.cart.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: cart.userId },
        create: { userId: cart.userId, price: 0 },
      }),
    );
    expect(transaction.cartItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { cartId: cart.id, productId, quantity: 2 },
      }),
    );
    expect(transaction.cart.update).toHaveBeenCalledWith({
      where: { id: cart.id },
      data: { price: new Prisma.Decimal('150') },
    });
    expect(response).toEqual({
      ...addedItem,
      product: { ...addedItem.product, price: '75' },
    });
    expect(cache.set).toHaveBeenCalledWith(
      `cart-version:${cart.userId}`,
      expect.any(String),
    );
  });

  it('increases an existing item instead of creating a duplicate', async () => {
    transaction.cartItem.findUnique.mockResolvedValue({
      id: addedItem.id,
      quantity: 3,
    });
    transaction.cartItem.update.mockResolvedValue({
      ...addedItem,
      quantity: 5,
    });

    await service.addToCart(cart.userId, { productId, quantity: 2 });

    expect(transaction.cartItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: addedItem.id },
        data: { quantity: 5 },
      }),
    );
    expect(transaction.cartItem.create).not.toHaveBeenCalled();
  });

  it('rejects missing products and insufficient stock without invalidating cache', async () => {
    prisma.product.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.addToCart(cart.userId, { productId, quantity: 1 }),
    ).rejects.toThrow('Product not found');

    prisma.product.findUnique.mockResolvedValueOnce({
      id: productId,
      price: new Prisma.Decimal('75.00'),
      quantity: 1,
    });
    await expect(
      service.addToCart(cart.userId, { productId, quantity: 2 }),
    ).rejects.toThrow('Requested quantity exceeds product stock');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('rejects when the existing plus requested quantity exceeds stock', async () => {
    transaction.cartItem.findUnique.mockResolvedValue({
      id: addedItem.id,
      quantity: 9,
    });

    await expect(
      service.addToCart(cart.userId, { productId, quantity: 2 }),
    ).rejects.toThrow('Total cart quantity exceeds product stock');

    expect(transaction.cartItem.update).not.toHaveBeenCalled();
    expect(transaction.cartItem.create).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('removes only the product from the authenticated user cart', async () => {
    transaction.cartItem.findMany.mockResolvedValue([]);

    await expect(
      service.removeFromCart(cart.userId, productId),
    ).resolves.toEqual({ deleted: true });

    expect(transaction.cart.findUnique).toHaveBeenCalledWith({
      where: { userId: cart.userId },
      select: { id: true },
    });
    expect(transaction.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: cart.id, productId },
    });
    expect(transaction.cart.update).toHaveBeenCalledWith({
      where: { id: cart.id },
      data: { price: new Prisma.Decimal(0) },
    });
    expect(cache.set).toHaveBeenCalledWith(
      `cart-version:${cart.userId}`,
      expect.any(String),
    );
  });

  it('returns 404 and keeps cache unchanged when the cart item is absent', async () => {
    transaction.cartItem.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.removeFromCart(cart.userId, productId),
    ).rejects.toThrow('Cart item not found');
    expect(transaction.cart.update).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
