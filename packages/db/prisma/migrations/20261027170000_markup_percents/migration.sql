-- AlterTable
ALTER TABLE "Shop" ADD COLUMN "markupPercents" INTEGER[] DEFAULT ARRAY[5, 10]::INTEGER[];
