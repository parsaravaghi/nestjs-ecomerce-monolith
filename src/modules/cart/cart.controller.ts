import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { User } from '../../common/decorators/user.decorator';
import { type AuthUser } from '../auth/auth-user.interface';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CartService } from './cart.service';
import { AddCartDto } from './dto/add-cart.dto';
import { GetCartDto } from './dto/get-cart.dto';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @UseGuards(AuthGuard)
  getCart(@User() user: AuthUser, @Query() dto: GetCartDto) {
    return this.cartService.getCart(user.sub, dto);
  }

  @Post()
  @UseGuards(AuthGuard)
  addToCart(@User() user: AuthUser, @Body() dto: AddCartDto) {
    return this.cartService.addToCart(user.sub, dto);
  }

  @Delete(':productId')
  @UseGuards(AuthGuard)
  removeFromCart(
    @User() user: AuthUser,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
  ) {
    return this.cartService.removeFromCart(user.sub, productId);
  }
}
