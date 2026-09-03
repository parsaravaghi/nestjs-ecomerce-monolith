import { NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { PrismaService } from '../../../src/database/prisma.service';
import { ProductService } from '../../../src/modules/product/product.service';

describe('ProductService', () => {
  const prisma = {
    product: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const service = new ProductService(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('creates a product owned by the authenticated user', async () => {
    prisma.product.create.mockResolvedValue({ id: 'product-id' });

    await service.createProduct(
      {
        title: 'Keyboard',
        price: '12.50',
        description: 'Mechanical',
        quantity: 8,
      },
      'user-id',
    );

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Keyboard',
        description: 'Mechanical',
        quantity: 8,
        userId: 'user-id',
      }),
    });
  });

  it('updates product inventory quantity', async () => {
    prisma.product.updateMany.mockResolvedValue({ count: 1 });
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-id',
      quantity: 4,
    });

    await service.updateProduct('product-id', { quantity: 4 });

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'product-id' },
      data: {
        title: undefined,
        price: undefined,
        description: undefined,
        quantity: 4,
      },
    });
  });

  it('returns 404 when update affects no product', async () => {
    prisma.product.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateProduct('missing-product', { title: 'Updated' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes by product ID and returns 404 when no product is affected', async () => {
    prisma.product.deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(service.deleteProduct('product-id')).resolves.toEqual({
      deleted: true,
    });
    expect(prisma.product.deleteMany).toHaveBeenCalledWith({
      where: { id: 'product-id' },
    });

    prisma.product.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.deleteProduct('missing-product'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fetches limit plus one and returns an opaque next cursor', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: '550e8400-e29b-41d4-a716-446655440000' },
      { id: '550e8400-e29b-41d4-a716-446655440001' },
    ]);

    const page = await service.findAll({ limit: 1 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2, orderBy: { id: 'asc' } }),
    );
    expect(page.data).toHaveLength(1);
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it('throws when a product does not exist', async () => {
    prisma.product.findUnique.mockResolvedValue(null);

    await expect(
      service.findOne('550e8400-e29b-41d4-a716-446655440000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
