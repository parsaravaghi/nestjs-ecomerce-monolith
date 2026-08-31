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
  update(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Body() dto: ProductUpdateDto,
  ) {
    return this.productService.update(productId, dto);
  }

  @Delete('products/:productId')
  remove(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
  ) {
    return this.productService.remove(productId);
  }
}
