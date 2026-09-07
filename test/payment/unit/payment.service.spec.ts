import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import type { Cache } from 'cache-manager';
import { of } from 'rxjs';
import type { PrismaService } from '../../../src/database/prisma.service';
import { Prisma } from '../../../src/generated/prisma/client';
import { PaymentService } from '../../../src/modules/payment/payment.service';

describe('PaymentService idempotency', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const orderId = '550e8400-e29b-41d4-a716-446655440002';
  const idempotencyKey = '550e8400-e29b-41d4-a716-446655440003';
  const paymentId = '550e8400-e29b-41d4-a716-446655440004';
  const cartId = '550e8400-e29b-41d4-a716-446655440005';
  const cacheKey = `payment-idempotency:${userId}:${idempotencyKey}`;

  type PaymentRecord = {
    id: string;
    userId: string;
    orderId: string;
    status: 'QUEUED';
    amount: Prisma.Decimal;
    attempts: number;
    maxAttempts: number;
  };

  const transactionClient = {
    payment: {
      findFirst: jest.fn<() => Promise<PaymentRecord | null>>(() =>
        Promise.resolve(null),
      ),
      create: jest.fn(() =>
        Promise.resolve({ id: paymentId, status: 'QUEUED' }),
      ),
      update: jest.fn(() => Promise.resolve(undefined)),
    },
    paymentEvent: { create: jest.fn(() => Promise.resolve(undefined)) },
    user: {
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    cart: {
      findUnique: jest.fn(() => Promise.resolve({ id: cartId })),
    },
    cartItem: {
      deleteMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    order: {
      findFirst: jest.fn(() =>
        Promise.resolve({
          id: orderId,
          status: 'PAYMENT_PENDING',
          items: [{ price: new Prisma.Decimal(25), quantity: 2 }],
        }),
      ),
      update: jest.fn(() => Promise.resolve(undefined)),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    ),
  };
  const processClient = { emit: jest.fn(() => of(undefined)) };
  const retryClient = { emit: jest.fn(() => of(undefined)) };
  const cache = {
    get: jest.fn(() => Promise.resolve(undefined as string | undefined)),
    set: jest.fn(() => Promise.resolve(undefined)),
  };
  const service = new PaymentService(
    prisma as unknown as PrismaService,
    processClient as unknown as ClientProxy,
    retryClient as unknown as ClientProxy,
    cache as unknown as Cache,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    cache.get.mockResolvedValue(undefined);
  });

  it('rejects a previously used key before accessing the database', async () => {
    cache.get.mockResolvedValue(paymentId);

    await expect(
      service.createAndQueuePayment(orderId, userId, { idempotencyKey }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(cache.get).toHaveBeenCalledWith(cacheKey);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(processClient.emit).not.toHaveBeenCalled();
  });

  it('stores the payment id for 60 seconds after queueing succeeds', async () => {
    await service.createAndQueuePayment(orderId, userId, { idempotencyKey });

    expect(processClient.emit).toHaveBeenCalled();
    expect(cache.set).toHaveBeenCalledWith(cacheKey, paymentId, 60_000);
  });

  it('clears cart items before recording a successful payment', async () => {
    transactionClient.payment.findFirst.mockResolvedValueOnce({
      id: paymentId,
      userId,
      orderId,
      status: 'QUEUED',
      amount: new Prisma.Decimal(50),
      attempts: 0,
      maxAttempts: 4,
    });

    await service.processPayment(paymentId, userId);

    expect(transactionClient.cart.findUnique).toHaveBeenCalledWith({
      where: { userId },
      select: { id: true },
    });
    expect(transactionClient.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId },
    });
    expect(
      transactionClient.cartItem.deleteMany.mock.invocationCallOrder[0],
    ).toBeLessThan(
      transactionClient.payment.update.mock.invocationCallOrder[0],
    );
    expect(cache.set).toHaveBeenCalledWith(
      `cart-version:${userId}`,
      expect.any(String),
    );
  });
});
