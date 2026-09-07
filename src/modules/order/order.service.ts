import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(userId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const cart = await tx.cart.findUnique({
          where: { userId },
          select: { id: true },
        });
        if (!cart) throw new NotFoundException('Cart not found');

        const cartItems = await tx.cartItem.findMany({
          where: { cartId: cart.id },
          select: {
            productId: true,
            quantity: true,
            price: true,
          },
        });
        if (cartItems.length === 0) {
          throw new BadRequestException(
            'Cannot create an order from an empty cart',
          );
        }

        return tx.order.create({
          data: {
            userId,
            status: 'PAYMENT_PENDING',
            items: {
              create: cartItems.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                price: item.price,
              })),
            },
          },
          include: { items: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
