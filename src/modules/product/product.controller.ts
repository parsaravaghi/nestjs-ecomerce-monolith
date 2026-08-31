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
} from '@nestjs/common';
import { CreateProductDto } from './dtos/create-product.dto';
import { ProductQueryDto } from './dtos/product-query.dto';
import { ProductUpdateDto } from './dtos/product-update.dto';
import { ProductService } from './product.service';

@Controller()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.productService.createProduct(dto);
  }

  @Get('product')
  findAll(@Query() query: ProductQueryDto) {
    return this.productService.findAll(query);
  }

  @Get('products/:productId')
  findOne(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
  ) {
    return this.productService.findOne(productId);
  }

  @Put('product/:productId')
  update(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Body() dto: ProductUpdateDto,
  ) {
    return this.productService.update(productId, dto);
  }

  @Delete('product/:productId')
  remove(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
  ) {
    return this.productService.remove(productId);
  }
}
