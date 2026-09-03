import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateProductDto } from './dtos/create-product.dto';
import { ProductQueryDto } from './dtos/product-query.dto';
import { ProductUpdateDto } from './dtos/product-update.dto';
import { ProductService } from './product.service';
import { User } from 'src/common/decorators/user.decorator';
import { type AuthUser } from '../auth/auth-user.interface';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/client';

@Controller()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post('products')
  @UseGuards(AuthGuard)
  createProduct(@Body() dto: CreateProductDto, @User() user: AuthUser) {
    return this.productService.createProduct(dto, user.sub);
  }

  @Get('products')
  findAll(@Query() query: ProductQueryDto) {
    return this.productService.findAll(query);
  }

  @Get('products/:productId')
  findOne(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
  ) {
    return this.productService.findOne(productId);
  }

  @Put('products/:productId')
  updateProduct(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Body() dto: ProductUpdateDto,
  ) {
    return this.productService.updateProduct(productId, dto);
  }

  @Delete('products/:productId')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERUSER)
  deleteProduct(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
  ) {
    return this.productService.deleteProduct(productId);
  }
}
