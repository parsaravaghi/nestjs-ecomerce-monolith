import { CartItem, CartPage } from '../entities/cart.entity';

export const CART_REPOSITORY = Symbol('CART_REPOSITORY');

export type AddCartItemResult =
  | { status: 'added'; item: CartItem }
  | { status: 'product-not-found' }
  | { status: 'insufficient-stock'; existingQuantity: number; stock: number };

export interface ICartRepository {
  getOrCreatePage(
    userId: string,
    options: { limit: number; cursor?: string },
  ): Promise<CartPage>;
  addItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<AddCartItemResult>;
  removeItem(userId: string, productId: string): Promise<boolean>;
}
