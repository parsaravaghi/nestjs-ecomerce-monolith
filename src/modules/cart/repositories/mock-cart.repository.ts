import { CartPage } from '../entities/cart.entity';
import {
  AddCartItemResult,
  ICartRepository,
} from '../interfaces/cart-repository.interface';

export class MockCartRepository implements ICartRepository {
  getOrCreatePageHandler?: ICartRepository['getOrCreatePage'];
  addItemHandler?: ICartRepository['addItem'];
  removeItemHandler?: ICartRepository['removeItem'];

  getOrCreatePage(
    userId: string,
    options: { limit: number; cursor?: string },
  ): Promise<CartPage> {
    if (!this.getOrCreatePageHandler)
      throw new Error('getOrCreatePage mock is not configured');
    return this.getOrCreatePageHandler(userId, options);
  }

  addItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<AddCartItemResult> {
    if (!this.addItemHandler) throw new Error('addItem mock is not configured');
    return this.addItemHandler(userId, productId, quantity);
  }

  removeItem(userId: string, productId: string): Promise<boolean> {
    if (!this.removeItemHandler)
      throw new Error('removeItem mock is not configured');
    return this.removeItemHandler(userId, productId);
  }
}
