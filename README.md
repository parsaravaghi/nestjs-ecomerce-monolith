# NestJS E-commerce Monolith

A modular e-commerce backend built with NestJS 11, Prisma, PostgreSQL, Redis, and RabbitMQ. The application supports authentication, role-based authorization, product management, cached shopping carts, order creation, account balance operations, and asynchronous payment processing.

Although the application is deployed as a monolith, the code is split into domain-focused NestJS modules and uses RabbitMQ workers for payment processing and retry handling.

## Features

- User registration and login with bcrypt password hashing
- RS256 JWT authentication
- `USER`, `ADMIN`, and `SUPERUSER` roles
- Product creation, lookup, cursor pagination, update, and privileged deletion
- One cart per user with stock validation and price snapshots
- Redis-backed cart caching and cache invalidation
- Transactional order creation from the current cart
- One order to many payments relationship
- User balance charging and credit/debit operations
- UUID-v4 payment idempotency keys cached for 60 seconds
- RabbitMQ payment processing and retry queues
- Serializable Prisma transactions for sensitive cart, order, and payment operations
- Payment event history and bounded retry attempts
- Automatic cart cleanup after successful payment
- Unit, integration, and end-to-end tests

## Technology stack

| Area | Technology |
| --- | --- |
| Framework | NestJS 11, TypeScript |
| Database | PostgreSQL 18 |
| ORM | Prisma 7 with PostgreSQL driver adapter |
| Authentication | JWT RS256, bcrypt |
| Cache | Redis 8, Keyv, cache-manager |
| Messaging | RabbitMQ 4, NestJS microservices |
| Validation | class-validator, class-transformer |
| Testing | Jest, Supertest, ts-jest |

## Domain overview

```text
User 1 ──── 0..1 Cart 1 ──── * CartItem * ──── 1 Product
User 1 ──── * Product
User 1 ──── * Order 1 ──── * OrderItem * ──── 1 Product
User 1 ──── * Payment * ──── 1 Order
Payment 1 ──── * PaymentEvent
```

An order stores immutable item prices copied from the cart. An order may have multiple payment attempts, but the service prevents creating another non-failed payment for the same order.

## Requirements

- Node.js 20 or newer
- npm
- PostgreSQL
- Redis
- RabbitMQ
- OpenSSL or another tool capable of generating an RSA key pair

## Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

On PowerShell:

```powershell
Copy-Item .env.example .env
```

Configure these values:

| Variable | Purpose | Example/default |
| --- | --- | --- |
| `APP_DB_USER` | PostgreSQL application user | `postgres` |
| `APP_DB_PASSWORD` | PostgreSQL password | `postgres` |
| `APP_DB_NAME` | PostgreSQL database | `ecommerce` |
| `APP_DB_HOST` | PostgreSQL host | `localhost` |
| `APP_DB_PORT` | PostgreSQL port | `5432` |
| `JWT_PRIVATE_KEY` | RSA private key used to sign tokens | Required |
| `JWT_PUBLIC_KEY` | RSA public key used to verify tokens | Required |
| `JWT_EXPIRES_IN` | Access-token lifetime | `1h` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `CART_CACHE_TTL` | Cart cache TTL in milliseconds | `60000` |
| `RABBITMQ_URL` | RabbitMQ AMQP URL | `amqp://ecommerce:ecommerce@localhost:5672` |
| `RABBITMQ_PROCESS_QUEUE` | Initial payment queue | `payment-process` |
| `RABBITMQ_RETRY_QUEUE` | Technical-failure retry queue | `payment-retry` |
| `PORT` | HTTP port | `3000` |

Generate an RSA key pair:

```bash
openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in private.pem -out public.pem
```

Store each PEM value on one line in `.env`, replacing real line breaks with `\n`. The application converts those escaped line breaks back when configuring JWT.

> Docker Compose passes `.env` to PostgreSQL, but the official PostgreSQL image reads `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`. Set those variables to the same values as their `APP_DB_*` counterparts before starting PostgreSQL with Compose.

## Installation and startup

Install dependencies:

```bash
npm install
```

Start PostgreSQL, Redis, and RabbitMQ:

```bash
docker compose up -d
```

Apply all committed database migrations and generate Prisma Client:

```bash
npx prisma migrate deploy
npx prisma generate
```

Start the application in development mode:

```bash
npm run start:dev
```

The HTTP API is available at `http://localhost:3000`. RabbitMQ management is available at `http://localhost:15672` when using the included Compose file.

## Authentication

Protected endpoints require a bearer token:

```http
Authorization: Bearer <auth_token>
Content-Type: application/json
```

Register and then log in to obtain `auth_token`:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"parsa","password":"strong-password","email":"parsa@example.com"}'

curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"parsa","password":"strong-password"}'
```

## API reference

### Authentication

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | No | Create a user. Password must contain at least 8 characters. |
| `POST` | `/auth/login` | No | Return `{ "auth_token": "..." }`. |
| `GET` | `/auth/me` | Bearer | Return the verified JWT payload. |

Registration body:

```json
{
  "username": "parsa",
  "password": "strong-password",
  "email": "parsa@example.com"
}
```

### Products

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/products` | Bearer | Create a product owned by the authenticated user. |
| `GET` | `/products?limit=20&cursor=...` | No | List products using cursor pagination. Maximum limit is 100. |
| `GET` | `/products/:productId` | No | Read one product by UUID v4. |
| `PUT` | `/products/:productId` | No | Update provided product fields. |
| `DELETE` | `/products/:productId` | Bearer + role | Delete a product as `ADMIN` or `SUPERUSER`. |

Create product body:

```json
{
  "title": "Mechanical Keyboard",
  "price": "129.99",
  "description": "Hot-swappable mechanical keyboard",
  "quantity": 25
}
```

Prices are strings to avoid floating-point precision loss. They support up to two decimal places and the database stores them as `Decimal(18,2)`.

For product pagination, pass the opaque `nextCursor` returned by the previous response. Clients should not decode or construct product cursors.

### Cart

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/cart?limit=20&cursor=<item-uuid>` | Bearer | Lazily create/read the user's cart and paginate items. |
| `POST` | `/cart` | Bearer | Add a product or increase its existing quantity. |
| `DELETE` | `/cart/:productId` | Bearer | Remove a product from the cart. |

Add-to-cart body:

```json
{
  "productId": "550e8400-e29b-41d4-a716-446655440000",
  "quantity": 2
}
```

The service rejects missing products and quantities above available stock. Cart changes recalculate the total and invalidate cached cart pages.

### Orders

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/order` | Bearer | Create an order from the authenticated user's current cart. |

The cart must exist and contain at least one item. Order creation copies product IDs, quantities, and cart-time prices into `OrderItem` records within a serializable transaction. A new order starts as `PAYMENT_PENDING`.

### Balance and payments

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/payment/charge` | Bearer | Increase the user's balance. |
| `POST` | `/payment/credit` | Bearer | Decrease the user's balance when sufficient funds exist. |
| `POST` | `/order/:orderId/pay` | Bearer | Create and enqueue a payment for an owned order. |

Charge balance:

```json
{
  "balance": 500
}
```

Debit balance directly:

```json
{
  "credit": 25.5
}
```

Both amounts must be between `0.01` and `30000000`, with at most two decimal places.

Create a payment:

```bash
curl -X POST http://localhost:3000/order/ORDER_UUID/pay \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"idempotencyKey":"550e8400-e29b-41d4-a716-446655440000"}'
```

The `idempotencyKey` must be a client-generated UUID v4. A successful request stores the resulting payment ID in Redis for 60 seconds. Reusing the same key for the same user during that window returns `409 Conflict`.

## Payment lifecycle

1. The API validates authentication, order ownership, order status, and the idempotency key.
2. Prisma creates a `QUEUED` payment and a `CREATED` payment event.
3. The API publishes the payment ID and user ID to the RabbitMQ process queue.
4. The worker records `PENDING` and atomically attempts to debit the balance.
5. Insufficient balance marks the payment `FAILED` and returns a domain error.
6. A successful debit deletes all items from the user's cart, marks the payment `SUCCESSED`, records `SUCCESS`, and changes the order to `SHIPPING` in the same transaction.
7. After commit, the user's cart cache is invalidated.
8. Technical failures increment `attempts` and publish to the retry queue until `maxAttempts` is reached.

RabbitMQ consumers use manual acknowledgements. A handled domain payment failure is acknowledged; an unexpected handler failure is left unacknowledged so broker behavior can retry according to queue configuration.

## API tips

- Generate a fresh payment idempotency UUID for each intentional payment attempt. Reuse the same UUID only when retrying the same HTTP request.
- Treat pagination cursors as opaque values and always use the server-provided `nextCursor`.
- Send monetary product values as decimal strings, not JavaScript floating-point numbers.
- A payment request is asynchronous: the HTTP response confirms creation/queueing, not final settlement.
- Keep Redis and RabbitMQ available before starting the app because the cache and microservice transports are initialized during bootstrap.
- Run `npx prisma migrate deploy` during deployment before starting new application instances.
- Do not commit `.env`, RSA private keys, database credentials, or RabbitMQ credentials.
- Product update is currently public, while product deletion is role-protected. Add authentication/ownership rules before exposing this API publicly if that is not intentional.
- The persisted success enum is currently spelled `SUCCESSED`; API consumers and database queries must use that exact value unless a migration renames it.

## Validation and errors

Global validation transforms primitive query/body values and removes properties that are not declared in DTOs. Invalid DTO input returns `400 Bad Request`.

Common responses include:

- `400` for validation, numeric range, balance, or malformed cursor errors
- `401`/`403` for missing, invalid, or insufficient authorization
- `404` for missing users, products, carts, orders, or related records
- `409` for duplicate unique values, concurrent cart changes, invalid order state, or reused idempotency keys
- `500` for unexpected database or infrastructure failures

## Database migrations

Create a migration during development:

```bash
npx prisma migrate dev --name descriptive_change_name
```

Apply committed migrations in CI or production:

```bash
npx prisma migrate deploy
```

Regenerate the checked-in Prisma client after schema changes:

```bash
npx prisma generate
```

The generated client is written to `src/generated/prisma`.

## Testing and quality checks

```bash
npm test                 # all tests
npm run test:unit        # unit tests
npm run test:integration # PostgreSQL integration tests
npm run test:e2e         # HTTP end-to-end tests
npm run test:cov         # coverage
npm run build            # TypeScript/Nest build
npm run lint             # ESLint with automatic fixes
npm run format           # Prettier
```

Integration and end-to-end tests use the configured database and may create/delete test records. Apply migrations before running them.

## Project structure

```text
src/
├── common/              # decorators and global exception filters
├── database/            # Prisma module and service
├── generated/prisma/    # generated Prisma Client
├── modules/
│   ├── auth/            # registration, login, JWT and role guards
│   ├── cart/            # cart service, repository, cache and DTOs
│   ├── order/           # transactional order creation
│   ├── payment/         # balance, checkout, queues and worker
│   └── product/         # product CRUD and pagination
├── app.module.ts
└── main.ts

prisma/
├── migrations/
└── schema.prisma

test/
├── auth/
├── cart/
├── payment/
└── product/
```

## Production considerations

- Use a managed secret store for JWT keys and infrastructure credentials.
- Restrict product mutations with ownership or role policies as appropriate.
- Configure RabbitMQ dead-letter exchanges, retry delay/backoff, and queue monitoring.
- Use an atomic Redis `SET NX` strategy if idempotency must protect against truly concurrent requests across multiple instances; the current cache check and later write protect sequential duplicates within the TTL.
- Add a durable idempotency key column if deduplication must survive Redis eviction or restarts.
- Add health/readiness endpoints for PostgreSQL, Redis, and RabbitMQ.
- Emit structured logs and metrics for payment attempts, failures, retries, and queue depth.
- Run migrations as a separate deployment step and back up PostgreSQL before destructive schema changes.

## License

This project is private and currently marked `UNLICENSED`.
