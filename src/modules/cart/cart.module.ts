import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CART_REPOSITORY } from './interfaces/cart-repository.interface';
import { CartRepository } from './repositories/cart.repository';

@Module({
  imports: [AuthModule],
  controllers: [CartController],
  providers: [
    CartService,
    { provide: CART_REPOSITORY, useClass: CartRepository },
  ],
  exports: [CartService],
})
export class CartModule {}
