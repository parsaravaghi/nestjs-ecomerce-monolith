import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import Keyv from 'keyv';
import { APP_FILTER } from '@nestjs/core';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProductModule } from './modules/product/product.module';
import { CartModule } from './modules/cart/cart.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const configuredTtl = Number(
          configService.get<string>('CART_CACHE_TTL', '60000'),
        );
        const ttl =
          Number.isInteger(configuredTtl) && configuredTtl > 0
            ? configuredTtl
            : 60_000;
        const redisStore = new KeyvRedis(
          configService.getOrThrow<string>('REDIS_URL'),
          {
            throwOnConnectError: true,
            throwOnErrors: true,
          },
        );

        return {
          ttl,
          stores: [new Keyv(redisStore)],
        };
      },
    }),
    PrismaModule,
    AuthModule,
    ProductModule,
    CartModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_FILTER,
      useClass: PrismaExceptionFilter,
    },
  ],
})
export class AppModule {}
