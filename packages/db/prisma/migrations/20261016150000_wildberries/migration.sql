-- CreateTable
CREATE TABLE "WbAccount" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WbAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WbReportRow" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "rrdId" BIGINT NOT NULL,
    "realizationreportId" BIGINT,
    "nmId" BIGINT,
    "saName" TEXT,
    "brand" TEXT,
    "subject" TEXT,
    "title" TEXT,
    "docType" TEXT,
    "operName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "retailAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "forPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "delivery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "penalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acceptance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deduction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "additionalPayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT,
    "saleDate" TIMESTAMP(3),
    "rrDate" TIMESTAMP(3),

    CONSTRAINT "WbReportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WbProduct" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "nmId" BIGINT NOT NULL,
    "saName" TEXT,
    "title" TEXT,
    "costPrice" DOUBLE PRECISION,

    CONSTRAINT "WbProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WbAccount_ownerId_key" ON "WbAccount"("ownerId");

-- CreateIndex
CREATE INDEX "WbReportRow_accountId_saleDate_idx" ON "WbReportRow"("accountId", "saleDate");

-- CreateIndex
CREATE UNIQUE INDEX "WbReportRow_accountId_rrdId_key" ON "WbReportRow"("accountId", "rrdId");

-- CreateIndex
CREATE UNIQUE INDEX "WbProduct_accountId_nmId_key" ON "WbProduct"("accountId", "nmId");

-- AddForeignKey
ALTER TABLE "WbAccount" ADD CONSTRAINT "WbAccount_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbReportRow" ADD CONSTRAINT "WbReportRow_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WbAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WbProduct" ADD CONSTRAINT "WbProduct_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WbAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

