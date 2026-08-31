-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_title_key" ON "Product"("title");
