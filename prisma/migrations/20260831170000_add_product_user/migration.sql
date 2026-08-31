-- Preserve existing users while adding the timestamps currently declared by the schema.
ALTER TABLE "User"
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Existing products have no known owner, so this column is nullable for legacy rows.
ALTER TABLE "Product" ADD COLUMN "userId" UUID;

-- CreateIndex
CREATE INDEX "Product_userId_idx" ON "Product"("userId");

-- AddForeignKey
ALTER TABLE "Product"
ADD CONSTRAINT "Product_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
