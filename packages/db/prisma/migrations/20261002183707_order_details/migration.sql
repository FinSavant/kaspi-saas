-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "courierTransmissionDate" TIMESTAMP(3),
ADD COLUMN     "deliveryMode" TEXT,
ADD COLUMN     "express" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isKaspiDelivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentMode" TEXT;
