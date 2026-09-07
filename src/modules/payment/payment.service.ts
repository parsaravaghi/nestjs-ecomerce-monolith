import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { Cache } from 'cache-manager';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { BalanceChargeDto } from './dto/balance-charge.dto';
import { CreditPaymentDto } from './dto/credit-payment.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentException } from './payment.exception';
import {
  PAYMENT_PROCESS_CLIENT,
  PAYMENT_PROCESS_PATTERN,
  PAYMENT_RETRY_CLIENT,
  PAYMENT_RETRY_PATTERN,
} from './payment.constants';

const MAX_ALLOWED_BALANCE = new Prisma.Decimal('99999999.99');
const PAYMENT_IDEMPOTENCY_TTL_MS = 60_000;

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROCESS_CLIENT)
    private readonly processClient: ClientProxy,
    @Inject(PAYMENT_RETRY_CLIENT)
    private readonly retryClient: ClientProxy,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async balanceCharge(dto: BalanceChargeDto, userId: string) {
    const amount = new Prisma.Decimal(dto.balance);
    const result = await this.prisma.user.updateMany({
      where: {
        id: userId,
        balance: { lte: MAX_ALLOWED_BALANCE.minus(amount) },
      },
      data: { balance: { increment: amount } },
    });

    if (result.count === 0) {
      this.throwChargeFailure();
    }

    return this.getPaymentUser(userId);
  }

  async credit(dto: CreditPaymentDto, userId: string) {
    const amount = new Prisma.Decimal(dto.credit);
    const result = await this.prisma.user.updateMany({
      where: {
        id: userId,
        balance: { gte: amount },
      },
      data: { balance: { decrement: amount } },
    });

    if (result.count === 0) {
      this.throwCreditFailure();
    }

    return this.getPaymentUser(userId);
  }

  async createAndQueuePayment(
    orderId: string,
    userId: string,
    dto: CreatePaymentDto,
  ) {
    const idempotencyCacheKey = this.paymentIdempotencyKey(
      userId,
      dto.idempotencyKey,
    );
    const cachedPaymentId =
      await this.cacheManager.get<string>(idempotencyCacheKey);
    if (cachedPaymentId) {
      throw new ConflictException('Idempotency key has already been used');
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, userId },
        include: { items: { select: { price: true, quantity: true } } },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (order.status !== 'PAYMENT_PENDING') {
        throw new ConflictException('Order is not awaiting payment');
      }

      const existing = await tx.payment.findFirst({
        where: { orderId, status: { not: 'FAILED' } },
      });
      if (existing) return existing;
      const amount = order.items.reduce(
        (total, item) => total.plus(item.price.mul(item.quantity)),
        new Prisma.Decimal(0),
      );
      return tx.payment.create({
        data: {
          orderId,
          userId,
          amount,
          status: 'QUEUED',
          events: { create: { status: 'CREATED' } },
        },
      });
    });

    if (payment.status === 'QUEUED') {
      await firstValueFrom(
        this.processClient.emit(PAYMENT_PROCESS_PATTERN, {
          paymentId: payment.id,
          userId,
        }),
      );
    }
    await this.cacheManager.set(
      idempotencyCacheKey,
      payment.id,
      PAYMENT_IDEMPOTENCY_TTL_MS,
    );
    return payment;
  }

  async processPayment(paymentId: string, userId: string): Promise<void> {
    let outcome: 'completed' | 'insufficient-balance' | 'ignored' = 'ignored';
    try {
      outcome = await this.prisma.$transaction(
        async (tx) => {
          const payment = await tx.payment.findFirst({
            where: { id: paymentId, userId },
          });
          if (!payment || payment.status !== 'QUEUED') return 'ignored';
          if (payment.attempts >= payment.maxAttempts) {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: 'FAILED',
                events: { create: { status: 'FAILED' } },
              },
            });
            return 'ignored';
          }

          await tx.paymentEvent.create({
            data: { paymentId: payment.id, status: 'PENDING' },
          });
          const debit = await tx.user.updateMany({
            where: { id: userId, balance: { gte: payment.amount } },
            data: { balance: { decrement: payment.amount } },
          });
          if (debit.count === 0) {
            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: 'FAILED',
                attempts: { increment: 1 },
                events: { create: { status: 'FAILED' } },
              },
            });
            return 'insufficient-balance';
          }

          const cart = await tx.cart.findUnique({
            where: { userId },
            select: { id: true },
          });
          if (cart) {
            await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
          }

          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'SUCCESSED',
              attempts: { increment: 1 },
              events: { create: { status: 'SUCCESS' } },
            },
          });
          await tx.order.update({
            where: { id: payment.orderId },
            data: { status: 'SHIPPING' },
          });
          return 'completed';
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch {
      const shouldRetry = await this.recordTechnicalFailure(paymentId, userId);
      if (shouldRetry) {
        await firstValueFrom(
          this.retryClient.emit(PAYMENT_RETRY_PATTERN, { paymentId, userId }),
        );
      }
      return;
    }

    if (outcome === 'insufficient-balance') {
      throw new PaymentException(
        'INSUFFICIENT_BALANCE',
        'User balance is lower than the order amount',
      );
    }
    if (outcome === 'completed') {
      await this.cacheManager.set(`cart-version:${userId}`, randomUUID());
    }
  }

  private async recordTechnicalFailure(
    paymentId: string,
    userId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, userId, status: 'QUEUED' },
      });
      if (!payment) return false;
      const attempts = payment.attempts + 1;
      const shouldRetry = attempts < payment.maxAttempts;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          attempts,
          status: shouldRetry ? 'QUEUED' : 'FAILED',
          events: {
            create: { status: shouldRetry ? 'RETRYING' : 'FAILED' },
          },
        },
      });
      return shouldRetry;
    });
  }

  private throwChargeFailure(): never {
    throw new PaymentException(
      'BALANCE_LIMIT_EXCEEDED',
      'Balance must remain lower than 100000000',
    );
  }

  private throwCreditFailure(): never {
    throw new PaymentException(
      'INSUFFICIENT_BALANCE',
      'User balance is lower than the requested credit',
    );
  }

  private getPaymentUser(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, balance: true, updatedAt: true },
    });
  }

  private paymentIdempotencyKey(userId: string, idempotencyKey: string) {
    return `payment-idempotency:${userId}:${idempotencyKey}`;
  }
}
