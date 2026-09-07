import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User } from '../../common/decorators/user.decorator';
import { type AuthUser } from '../auth/auth-user.interface';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentService } from './payment.service';

@Controller('order')
@UseGuards(AuthGuard)
export class CheckoutController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post(':orderId/pay')
  pay(
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @Body() dto: CreatePaymentDto,
    @User() user: AuthUser,
  ) {
    return this.paymentService.createAndQueuePayment(orderId, user.sub, dto);
  }
}
