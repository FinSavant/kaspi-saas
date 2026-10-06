-- AlterTable
ALTER TABLE "Order" ADD COLUMN "customerName" TEXT,
ADD COLUMN "plannedDeliveryDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN "reviewsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reviewsEnabledAt" TIMESTAMP(3),
ADD COLUMN "reviewHoursFrom" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN "reviewHoursTo" INTEGER NOT NULL DEFAULT 23,
ADD COLUMN "reviewDelayHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "newOrderMessages" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "reviewMessages" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "newOrderTemplate" TEXT,
ADD COLUMN "reviewTemplate" TEXT;

-- CreateTable
CREATE TABLE "ReviewMessage" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "groupId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repliedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewMessage_shopId_orderCode_kind_key" ON "ReviewMessage"("shopId", "orderCode", "kind");

-- CreateIndex
CREATE INDEX "ReviewMessage_shopId_sentAt_idx" ON "ReviewMessage"("shopId", "sentAt");

-- AddForeignKey
ALTER TABLE "ReviewMessage" ADD CONSTRAINT "ReviewMessage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
