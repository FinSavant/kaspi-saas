-- AlterTable
ALTER TABLE "WbReportRow" ADD COLUMN     "saleMethod" TEXT,
ADD COLUMN     "warehouse" TEXT;

-- CreateTable
CREATE TABLE "WbReport" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "reportId" BIGINT NOT NULL,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "fileName" TEXT,
    "rowsCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WbReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WbReport_accountId_reportId_key" ON "WbReport"("accountId", "reportId");

-- CreateIndex
CREATE INDEX "WbReportRow_accountId_realizationreportId_idx" ON "WbReportRow"("accountId", "realizationreportId");

-- AddForeignKey
ALTER TABLE "WbReport" ADD CONSTRAINT "WbReport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WbAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Отчёты, уже загруженные через API, — в список отчётов
INSERT INTO "WbReport" ("id", "accountId", "reportId", "dateFrom", "dateTo", "source", "rowsCount", "uploadedAt")
SELECT 'api_' || "accountId" || '_' || "realizationreportId", "accountId", "realizationreportId", MIN("rrDate"), MAX("rrDate"), 'api', COUNT(*), NOW()
FROM "WbReportRow" WHERE "realizationreportId" IS NOT NULL
GROUP BY "accountId", "realizationreportId";
