-- CreateTable
CREATE TABLE "PickingMark" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "collected" BOOLEAN NOT NULL DEFAULT false,
    "packed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickingMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PickingMark_shopId_orderCode_sku_key" ON "PickingMark"("shopId", "orderCode", "sku");

-- AddForeignKey
ALTER TABLE "PickingMark" ADD CONSTRAINT "PickingMark_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
