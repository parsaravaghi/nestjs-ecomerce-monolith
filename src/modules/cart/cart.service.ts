import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { randomUUID } from 'node:crypto';
import { AddCartDto } from './dto/add-cart.dto';
import { GetCartDto } from './dto/get-cart.dto';
import { CartItem, CartPage } from './entities/cart.entity';
import { CART_REPOSITORY } from './interfaces/cart-repository.interface';
import type { ICartRepository } from './interfaces/cart-repository.interface';

export type CartResponse = CartPage;
export type AddedCartItemResponse = CartItem;

@Injectable()
export class CartService {
  constructor(
    @Inject(CART_REPOSITORY) private readonly cartRepo: ICartRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async getCart(userId: string, dto: GetCartDto): Promise<CartResponse> {
    const version = await this.getCacheVersion(userId);
    const cacheKey = this.buildCacheKey(userId, version, dto);
    const cached = await this.cacheManager.get<CartResponse>(cacheKey);
    if (cached) return cached;

    const cart = await this.cartRepo.getOrCreatePage(userId, dto);
    await this.cacheManager.set(cacheKey, cart);
    return cart;
  }

  async addToCart(
    userId: string,
    dto: AddCartDto,
  ): Promise<AddedCartItemResponse> {
    const result = await this.cartRepo.addItem(
      userId,
      dto.productId,
      dto.quantity,
    );
    if (result.status === 'product-not-found')
      throw new NotFoundException('Product not found');
    if (result.status === 'insufficient-stock') {
      throw new BadRequestException(
        result.existingQuantity === 0
          ? 'Requested quantity exceeds product stock'
          : 'Total cart quantity exceeds product stock',
      );
    }
    await this.invalidateUserCartCache(userId);
    return result.item;
  }

  async removeFromCart(
    userId: string,
    productId: string,
  ): Promise<{ deleted: true }> {
    if (!(await this.cartRepo.removeItem(userId, productId)))
      throw new NotFoundException('Cart item not found');
    await this.invalidateUserCartCache(userId);
    return { deleted: true };
  }

  async invalidateUserCartCache(userId: string): Promise<void> {
    await this.cacheManager.set(this.versionKey(userId), randomUUID());
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
