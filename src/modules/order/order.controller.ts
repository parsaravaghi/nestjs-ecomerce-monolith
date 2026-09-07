import { Controller, Post, UseGuards } from '@nestjs/common';
import { User } from '../../common/decorators/user.decorator';
import { type AuthUser } from '../auth/auth-user.interface';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrderService } from './order.service';

@Controller('order')
@UseGuards(AuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  createOrder(@User() user: AuthUser) {
    return this.orderService.createOrder(user.sub);
  }
}
