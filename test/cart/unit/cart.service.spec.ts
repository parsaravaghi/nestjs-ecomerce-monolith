import { jest } from '@jest/globals';
import type { Cache } from 'cache-manager';
import type { ICartRepository } from '../../../src/modules/cart/interfaces/cart-repository.interface';
import { CartService } from '../../../src/modules/cart/cart.service';
import type {
  CartItem,
  CartPage,
} from '../../../src/modules/cart/entities/cart.entity';

describe('CartService', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const productId = '550e8400-e29b-41d4-a716-446655440002';
  const cart: CartPage = {
    id: '550e8400-e29b-41d4-a716-446655440003',
    userId,
    price: '25',
    items: [],
    pagination: { limit: 20, nextCursor: null, hasNextPage: false },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
  const item: CartItem = {
    id: '550e8400-e29b-41d4-a716-446655440004',
    productId,
    quantity: 1,
    product: {
      id: productId,
      title: 'Keyboard',
      price: '25',
      description: 'Mechanical',
    },
  };
  const repository = {
    getOrCreatePage: jest.fn<ICartRepository['getOrCreatePage']>(),
    addItem: jest.fn<ICartRepository['addItem']>(),
    removeItem: jest.fn<ICartRepository['removeItem']>(),
  } satisfies ICartRepository;
  const cache = { get: jest.fn<Cache['get']>(), set: jest.fn<Cache['set']>() };
  const service = new CartService(repository, cache as unknown as Cache);

  beforeEach(() => {
    jest.clearAllMocks();
    cache.get.mockResolvedValue(undefined);
    cache.set.mockResolvedValue(undefined);
    repository.getOrCreatePage.mockResolvedValue(cart);
    repository.addItem.mockResolvedValue({ status: 'added', item });
    repository.removeItem.mockResolvedValue(true);
  });

  it('uses the repository abstraction on a cache miss', async () => {
    await expect(service.getCart(userId, { limit: 20 })).resolves.toBe(cart);
    expect(repository.getOrCreatePage).toHaveBeenCalledWith(userId, {
      limit: 20,
    });
    expect(cache.set).toHaveBeenCalledWith(
      `cart:${userId}:v:1:limit:20:cursor:first`,
      cart,
    );
  });

  it('returns cached data without calling the repository', async () => {
    cache.get.mockResolvedValueOnce('2').mockResolvedValueOnce(cart);
    await expect(service.getCart(userId, { limit: 20 })).resolves.toBe(cart);
    expect(repository.getOrCreatePage).not.toHaveBeenCalled();
  });

  it('maps repository outcomes to application exceptions', async () => {
    repository.addItem.mockResolvedValueOnce({ status: 'product-not-found' });
    await expect(
      service.addToCart(userId, { productId, quantity: 1 }),
    ).rejects.toThrow('Product not found');

    repository.addItem.mockResolvedValueOnce({
      status: 'insufficient-stock',
      existingQuantity: 2,
      stock: 2,
    });
    await expect(
      service.addToCart(userId, { productId, quantity: 1 }),
    ).rejects.toThrow('Total cart quantity exceeds product stock');
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('returns an added item and invalidates cached cart pages', async () => {
    await expect(
      service.addToCart(userId, { productId, quantity: 1 }),
    ).resolves.toBe(item);
    expect(repository.addItem).toHaveBeenCalledWith(userId, productId, 1);
    expect(cache.set).toHaveBeenCalledWith(
      `cart-version:${userId}`,
      expect.any(String),
    );
  });

  it('lets the service decide that a missing cart item is a 404', async () => {
    repository.removeItem.mockResolvedValue(false);
    await expect(service.removeFromCart(userId, productId)).rejects.toThrow(
      'Cart item not found',
    );
  });
});
