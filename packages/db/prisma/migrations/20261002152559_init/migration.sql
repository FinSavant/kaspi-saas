-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WaybillLayout" AS ENUM ('THERMAL', 'A4_X4', 'A4_X8');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "telegramChatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "apiTokenEnc" TEXT NOT NULL,
    "cityId" TEXT NOT NULL DEFAULT '750000000',
    "repricerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "plan" TEXT NOT NULL DEFAULT 'yearly',
    "trialEndsAt" TIMESTAMP(3),
    "paidUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "kaspiSku" TEXT NOT NULL,
    "kaspiMasterSku" TEXT,
    "sellersCount" INTEGER,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "price" INTEGER NOT NULL,
    "costPrice" INTEGER,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepricerSetting" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "floorPrice" INTEGER NOT NULL,
    "ceilingPrice" INTEGER,
    "step" INTEGER NOT NULL DEFAULT 1,
    "checkIntervalSec" INTEGER NOT NULL DEFAULT 300,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepricerSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorLog" (
    "id" BIGSERIAL NOT NULL,
    "productId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT,
    "price" INTEGER NOT NULL,
    "position" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "oldPrice" INTEGER NOT NULL,
    "newPrice" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "kaspiOrderId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "deliveryCost" INTEGER NOT NULL DEFAULT 0,
    "commission" INTEGER NOT NULL DEFAULT 0,
    "city" TEXT,
    "waybillUrl" TEXT,
    "createdAtKaspi" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "kaspiSku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "costPrice" INTEGER,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryCommission" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "CategoryCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaybillBatch" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "layout" "WaybillLayout" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaybillBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintedWaybill" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "printedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintedWaybill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyProductStat" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "unitsSold" INTEGER NOT NULL,
    "revenue" INTEGER NOT NULL,
    "netProfit" INTEGER NOT NULL,

    CONSTRAINT "DailyProductStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_merchantId_key" ON "Shop"("merchantId");

-- CreateIndex
CREATE INDEX "Shop_ownerId_idx" ON "Shop"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_shopId_key" ON "Subscription"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_shopId_kaspiSku_key" ON "Product"("shopId", "kaspiSku");

-- CreateIndex
CREATE UNIQUE INDEX "RepricerSetting_productId_key" ON "RepricerSetting"("productId");

-- CreateIndex
CREATE INDEX "RepricerSetting_enabled_lastCheckedAt_idx" ON "RepricerSetting"("enabled", "lastCheckedAt");

-- CreateIndex
CREATE INDEX "CompetitorLog_productId_capturedAt_idx" ON "CompetitorLog"("productId", "capturedAt");

-- CreateIndex
CREATE INDEX "PriceChange_productId_createdAt_idx" ON "PriceChange"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_shopId_createdAtKaspi_idx" ON "Order"("shopId", "createdAtKaspi");

-- CreateIndex
CREATE INDEX "Order_shopId_state_idx" ON "Order"("shopId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Order_shopId_code_key" ON "Order"("shopId", "code");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryCommission_category_key" ON "CategoryCommission"("category");

-- CreateIndex
CREATE INDEX "WaybillBatch_shopId_createdAt_idx" ON "WaybillBatch"("shopId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrintedWaybill_shopId_orderCode_key" ON "PrintedWaybill"("shopId", "orderCode");

-- CreateIndex
CREATE UNIQUE INDEX "DailyProductStat_productId_date_key" ON "DailyProductStat"("productId", "date");

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepricerSetting" ADD CONSTRAINT "RepricerSetting_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorLog" ADD CONSTRAINT "CompetitorLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChange" ADD CONSTRAINT "PriceChange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaybillBatch" ADD CONSTRAINT "WaybillBatch_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintedWaybill" ADD CONSTRAINT "PrintedWaybill_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintedWaybill" ADD CONSTRAINT "PrintedWaybill_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "WaybillBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProductStat" ADD CONSTRAINT "DailyProductStat_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
