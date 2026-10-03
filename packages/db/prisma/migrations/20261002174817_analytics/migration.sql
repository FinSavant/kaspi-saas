/*
  Warnings:

  - You are about to drop the column `commission` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the `DailyProductStat` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `CategoryCommission` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "DailyProductStat" DROP CONSTRAINT "DailyProductStat_productId_fkey";

-- AlterTable
ALTER TABLE "CategoryCommission" ADD COLUMN     "title" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "commission",
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "itemsSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "categoryTitle" TEXT,
ADD COLUMN     "totalPrice" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "ordersSyncedAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "DailyProductStat";
