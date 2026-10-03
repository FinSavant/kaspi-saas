-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "commissionVatPercent" DECIMAL(5,2) NOT NULL DEFAULT 16,
ADD COLUMN     "paymentFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 0.95;
