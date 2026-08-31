import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Prisma, Product } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto } from './dtos/create-product.dto';
import { ProductQueryDto } from './dtos/product-query.dto';
import { ProductUpdateDto } from './dtos/product-update.dto';

interface ProductCursor {
  id: string;
}

export interface ProductPage {
  data: Product[];
  nextCursor: string | null;
}

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  createProduct(dto: CreateProductDto, userId: string) {
    return this.prisma.product.create({
      data: {
        title: dto.title,
        price: new Prisma.Decimal(dto.price),
        description: dto.description,
        userId: userId,
      },
    });
  }

  async findAll(query: ProductQueryDto): Promise<ProductPage> {
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const products = await this.prisma.product.findMany({
      take: query.limit + 1,
      ...(cursor && {
        cursor: { id: cursor.id },
        skip: 1,
      }),
      orderBy: { id: 'asc' },
    });
    const hasNextPage = products.length > query.limit;
    const data = products.slice(0, query.limit);

    return {
      data,
      nextCursor:
        hasNextPage && data.length > 0
          ? this.encodeCursor(data[data.length - 1].id)
          : null,
    };
  }

  async findOne(productId: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  update(productId: string, dto: ProductUpdateDto) {
    return this.prisma.product.update({
      where: { id: productId },
      data: {
        title: dto.title,
        price: new Prisma.Decimal(dto.price),
        description: dto.description,
      },
    });
  }

  remove(productId: string) {
    return this.prisma.product.delete({ where: { id: productId } });
  }

  private encodeCursor(id: string): string {
    return Buffer.from(JSON.stringify({ id }), 'utf8').toString('base64url');
  }

  private decodeCursor(cursor: string): ProductCursor {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(cursor)) {
        throw new Error('Invalid cursor encoding');
      }

      const payload = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as Partial<ProductCursor>;

      if (!payload.id || !isUUID(payload.id, '4')) {
        throw new Error('Invalid cursor payload');
      }

      return { id: payload.id };
    } catch {
      throw new BadRequestException('Invalid product cursor');
    }
  }
}
