import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { User } from '../../common/decorators/user.decorator';
import { type AuthUser } from '../auth/auth-user.interface';
import { AuthGuard } from '../auth/guards/auth.guard';
import { BalanceChargeDto } from './dto/balance-charge.dto';
import { CreditPaymentDto } from './dto/credit-payment.dto';
import { PaymentService } from './payment.service';

@Controller('payment')
@UseGuards(AuthGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('charge')
  balanceCharge(@Body() dto: BalanceChargeDto, @User() user: AuthUser) {
    return this.paymentService.balanceCharge(dto, user.sub);
  }

  @Post('credit')
  credit(@Body() dto: CreditPaymentDto, @User() user: AuthUser) {
    return this.paymentService.credit(dto, user.sub);
  }
}
