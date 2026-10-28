-- Склейки удаляются через сутки; отметки «напечатано» остаются без ссылки на склейку
ALTER TABLE "PrintedWaybill" DROP CONSTRAINT "PrintedWaybill_batchId_fkey";
ALTER TABLE "PrintedWaybill" ALTER COLUMN "batchId" DROP NOT NULL;
ALTER TABLE "PrintedWaybill" ADD CONSTRAINT "PrintedWaybill_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "WaybillBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
