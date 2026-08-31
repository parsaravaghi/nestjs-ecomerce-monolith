import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

const databaseUrl = new URL('postgresql://localhost');
databaseUrl.username = env('APP_DB_USER');
databaseUrl.password = env('APP_DB_PASSWORD');
databaseUrl.hostname = env('APP_DB_HOST');
databaseUrl.port = env('APP_DB_PORT');
databaseUrl.pathname = env('APP_DB_NAME');
databaseUrl.searchParams.set('schema', 'public');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl.toString(),
  },
});
