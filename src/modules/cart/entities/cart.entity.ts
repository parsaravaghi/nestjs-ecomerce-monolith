export class CartProduct {
  id: string;
  title: string;
  price: string;
  description?: string;
}

export class CartItem {
  id: string;
  productId: string;
  quantity: number;
  product: CartProduct;
}

export class Cart {
  id: string;
  userId: string;
  price: string;
  items: CartItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CartPage extends Cart {
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasNextPage: boolean;
  };
}
