-- Kaspi принимает предзаказ с настоящим остатком, запоминать его не нужно
ALTER TABLE "Product" DROP COLUMN "preorderStock";
