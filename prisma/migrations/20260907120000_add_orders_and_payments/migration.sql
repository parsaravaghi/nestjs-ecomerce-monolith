CREATE TYPE "OrderStatus" AS ENUM ('PAYMENT_PENDING', 'PENDING', 'SHIPPING', 'DELIVERED');
CREATE TYPE "PaymentStatus" AS ENUM ('QUEUED', 'FAILED', 'SUCCESSED');
CREATE TYPE "PaymentEventStatus" AS ENUM ('CREATED', 'PENDING', 'FAILED', 'SUCCESS', 'RETRYING');

ALTER TABLE "CartItem" ADD COLUMN "price" DECIMAL(18, 2);
UPDATE "CartItem" AS ci
SET "price" = p."price"
FROM "Product" AS p
WHERE ci."productId" = p."id";
ALTER TABLE "CartItem" ALTER COLUMN "price" SET NOT NULL;

CREATE TABLE "Order" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PAYMENT_PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderItem" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "price" DECIMAL(18, 2) NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
  "id" UUID NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'QUEUED',
  "amount" DECIMAL(18, 2) NOT NULL,
  "userId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 4,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentEvent" (
  "id" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "status" "PaymentEventStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");
CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
