import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { AddCartDto } from './dto/add-cart.dto';
import { GetCartDto } from './dto/get-cart.dto';

interface CartProductResponse {
  id: string;
  title: string;
  price: string;
  description: string;
}

interface CartItemResponse {
  id: string;
  quantity: number;
  product: CartProductResponse;
}

export interface CartResponse {
  id: string;
  userId: string;
  price: string;
  items: CartItemResponse[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasNextPage: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface AddedCartItemResponse {
  id: string;
  productId: string;
  quantity: number;
  product: {
    id: string;
    title: string;
    price: string;
  };
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async getCart(userId: string, dto: GetCartDto): Promise<CartResponse> {
    const version = await this.getCacheVersion(userId);
    const cacheKey = this.buildCacheKey(userId, version, dto);
    const cachedCart = await this.cacheManager.get<CartResponse>(cacheKey);

    if (cachedCart) {
      return cachedCart;
    }

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
          take: dto.limit + 1,
          ...(dto.cursor && {
            cursor: { id: dto.cursor },
            skip: 1,
          }),
          orderBy: { id: 'asc' },
          select: {
            id: true,
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
    const hasNextPage = cart.items.length > dto.limit;
    const pageItems = cart.items.slice(0, dto.limit);
    const response: CartResponse = {
      id: cart.id,
      userId: cart.userId,
      price: cart.price.toString(),
      items: pageItems.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        product: {
          ...item.product,
          price: item.product.price.toString(),
        },
      })),
      pagination: {
        limit: dto.limit,
        nextCursor:
          hasNextPage && pageItems.length > 0
            ? pageItems[pageItems.length - 1].id
            : null,
        hasNextPage,
      },
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    };

    await this.cacheManager.set(cacheKey, response);

    return response;
  }

  async addToCart(
    userId: string,
    dto: AddCartDto,
  ): Promise<AddedCartItemResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, price: true, quantity: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.quantity < dto.quantity) {
      throw new BadRequestException('Requested quantity exceeds product stock');
    }

    const item = await this.prisma.$transaction(
      async (transaction) => {
        const cart = await transaction.cart.upsert({
          where: { userId },
          update: {},
          create: { userId, price: 0 },
          select: { id: true },
        });
        const existingItem = await transaction.cartItem.findUnique({
          where: {
            cartId_productId: {
              cartId: cart.id,
              productId: product.id,
            },
          },
          select: { id: true, quantity: true },
        });
        const requestedTotal = (existingItem?.quantity ?? 0) + dto.quantity;

        if (requestedTotal > product.quantity) {
          throw new BadRequestException(
            'Total cart quantity exceeds product stock',
          );
        }

        const updatedItem = existingItem
          ? await transaction.cartItem.update({
              where: { id: existingItem.id },
              data: { quantity: requestedTotal },
              select: {
                id: true,
                productId: true,
                quantity: true,
                product: {
                  select: { id: true, title: true, price: true },
                },
              },
            })
          : await transaction.cartItem.create({
              data: {
                cartId: cart.id,
                productId: product.id,
                quantity: dto.quantity,
              },
              select: {
                id: true,
                productId: true,
                quantity: true,
                product: {
                  select: { id: true, title: true, price: true },
                },
              },
            });
        const cartItems = await transaction.cartItem.findMany({
          where: { cartId: cart.id },
          select: { quantity: true, product: { select: { price: true } } },
        });
        const price = cartItems.reduce(
          (total, cartItem) =>
            total.plus(cartItem.product.price.mul(cartItem.quantity)),
          new Prisma.Decimal(0),
        );

        await transaction.cart.update({
          where: { id: cart.id },
          data: { price },
        });

        return updatedItem;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    await this.invalidateUserCartCache(userId);

    return {
      ...item,
      product: { ...item.product, price: item.product.price.toString() },
    };
  }

  async invalidateUserCartCache(userId: string): Promise<void> {
    await this.cacheManager.set(this.versionKey(userId), randomUUID());
  }

  async removeFromCart(
    userId: string,
    productId: string,
  ): Promise<{ deleted: true }> {
    const removed = await this.prisma.$transaction(
      async (transaction) => {
        const cart = await transaction.cart.findUnique({
          where: { userId },
          select: { id: true },
        });

        if (!cart) {
          return false;
        }

        const result = await transaction.cartItem.deleteMany({
          where: { cartId: cart.id, productId },
        });

        if (result.count === 0) {
          return false;
        }

        const cartItems = await transaction.cartItem.findMany({
          where: { cartId: cart.id },
          select: { quantity: true, product: { select: { price: true } } },
        });
        const price = cartItems.reduce(
          (total, cartItem) =>
            total.plus(cartItem.product.price.mul(cartItem.quantity)),
          new Prisma.Decimal(0),
        );

        await transaction.cart.update({
          where: { id: cart.id },
          data: { price },
        });

        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!removed) {
      throw new NotFoundException('Cart item not found');
    }

    await this.invalidateUserCartCache(userId);

    return { deleted: true };
  }

  private async getCacheVersion(userId: string): Promise<string> {
    return (
      (await this.cacheManager.get<string>(this.versionKey(userId))) ?? '1'
    );
  }

  private versionKey(userId: string): string {
    return `cart-version:${userId}`;
  }

  private buildCacheKey(
    userId: string,
    version: string,
    dto: GetCartDto,
  ): string {
    return `cart:${userId}:v:${version}:limit:${dto.limit}:cursor:${dto.cursor ?? 'first'}`;
  }
}
