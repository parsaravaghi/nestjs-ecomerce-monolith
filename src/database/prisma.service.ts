import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    const databaseUrl = new URL('postgresql://localhost');
    databaseUrl.username = configService.getOrThrow<string>('APP_DB_USER');
    databaseUrl.password = configService.getOrThrow<string>('APP_DB_PASSWORD');
    databaseUrl.hostname = configService.getOrThrow<string>('APP_DB_HOST');
    databaseUrl.port = configService.getOrThrow<string>('APP_DB_PORT');
    databaseUrl.pathname = configService.getOrThrow<string>('APP_DB_NAME');
    databaseUrl.searchParams.set('schema', 'public');

    super({
      adapter: new PrismaPg({ connectionString: databaseUrl.toString() }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
