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
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const service = new ProductService(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('creates a product owned by the authenticated user', async () => {
    prisma.product.create.mockResolvedValue({ id: 'product-id' });

    await service.createProduct(
      { title: 'Keyboard', price: '12.50', description: 'Mechanical' },
      'user-id',
    );

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Keyboard',
        description: 'Mechanical',
        userId: 'user-id',
      }),
    });
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
