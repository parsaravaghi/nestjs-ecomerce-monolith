import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { CartItem, CartPage } from '../entities/cart.entity';
import {
  AddCartItemResult,
  ICartRepository,
} from '../interfaces/cart-repository.interface';

@Injectable()
export class CartRepository implements ICartRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreatePage(
    userId: string,
    options: { limit: number; cursor?: string },
  ): Promise<CartPage> {
    try {
      const cart = await this.prisma.cart.upsert({
        where: { userId },
        update: {},
        create: { userId, price: 0 },
        select: {
          id: true,
          userId: true,
          price: true,
          createdAt: true,
          updatedAt: true,
          items: {
            take: options.limit + 1,
            ...(options.cursor && { cursor: { id: options.cursor }, skip: 1 }),
            orderBy: { id: 'asc' },
            select: {
              id: true,
              productId: true,
              quantity: true,
              product: {
                select: {
                  id: true,
                  title: true,
                  price: true,
                  description: true,
                },
              },
            },
          },
        },
      });
      const hasNextPage = cart.items.length > options.limit;
      const items = cart.items.slice(0, options.limit);
      return {
        id: cart.id,
        userId: cart.userId,
        price: cart.price.toString(),
        items: items.map((item) => this.toDomainItem(item)),
        pagination: {
          limit: options.limit,
          nextCursor:
            hasNextPage && items.length ? items[items.length - 1].id : null,
          hasNextPage,
        },
        createdAt: cart.createdAt,
        updatedAt: cart.updatedAt,
      };
    } catch (error) {
      this.rethrowPrismaError(error);
    }
  }

  async addItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<AddCartItemResult> {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, quantity: true, price: true },
      });
      if (!product) return { status: 'product-not-found' };
      if (product.quantity < quantity)
        return {
          status: 'insufficient-stock',
          existingQuantity: 0,
          stock: product.quantity,
        };

      return await this.prisma.$transaction(
        async (tx): Promise<AddCartItemResult> => {
          const cart = await tx.cart.upsert({
            where: { userId },
            update: {},
            create: { userId, price: 0 },
            select: { id: true },
          });
          const existing = await tx.cartItem.findUnique({
            where: { cartId_productId: { cartId: cart.id, productId } },
            select: { id: true, quantity: true },
          });
          const requestedTotal = (existing?.quantity ?? 0) + quantity;
          if (requestedTotal > product.quantity) {
            return {
              status: 'insufficient-stock',
              existingQuantity: existing?.quantity ?? 0,
              stock: product.quantity,
            };
          }
          const item = existing
            ? await tx.cartItem.update({
                where: { id: existing.id },
                data: { quantity: requestedTotal, price: product.price },
                select: this.itemSelect(),
              })
            : await tx.cartItem.create({
                data: {
                  cartId: cart.id,
                  productId,
                  quantity,
                  price: product.price,
                },
                select: this.itemSelect(),
              });
          await this.recalculatePrice(tx, cart.id);
          return { status: 'added', item: this.toDomainItem(item) };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.rethrowPrismaError(error);
    }
  }

  async removeItem(userId: string, productId: string): Promise<boolean> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const cart = await tx.cart.findUnique({
            where: { userId },
            select: { id: true },
          });
          if (!cart) return false;
          const result = await tx.cartItem.deleteMany({
            where: { cartId: cart.id, productId },
          });
          if (!result.count) return false;
          await this.recalculatePrice(tx, cart.id);
          return true;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      this.rethrowPrismaError(error);
    }
  }

  private itemSelect() {
    return {
      id: true,
      productId: true,
      quantity: true,
      product: {
        select: { id: true, title: true, price: true, description: true },
      },
    } as const;
  }

  private toDomainItem(item: {
    id: string;
    productId: string;
    quantity: number;
    product: {
      id: string;
      title: string;
      price: { toString(): string };
      description: string;
    };
  }): CartItem {
    return {
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
      product: { ...item.product, price: item.product.price.toString() },
    };
  }

  private async recalculatePrice(
    tx: Prisma.TransactionClient,
    cartId: string,
  ): Promise<void> {
    const items = await tx.cartItem.findMany({
      where: { cartId },
      select: { quantity: true, price: true },
    });
    const price = items.reduce(
      (total, item) => total.plus(item.price.mul(item.quantity)),
      new Prisma.Decimal(0),
    );
    await tx.cart.update({ where: { id: cartId }, data: { price } });
  }

  private rethrowPrismaError(error: unknown): never {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
    if (error.code === 'P2002' || error.code === 'P2034')
      throw new ConflictException('Cart was modified concurrently; retry');
    if (error.code === 'P2003' || error.code === 'P2025')
      throw new NotFoundException('Related cart record was not found');
    throw new InternalServerErrorException('Unable to persist cart');
  }
}
