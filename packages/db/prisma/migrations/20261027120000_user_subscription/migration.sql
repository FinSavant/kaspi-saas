-- Подписка переезжает с магазина на продавца. Старые записи по магазинам
-- нигде не использовались — удаляются.
DELETE FROM "Subscription";
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_shopId_fkey";
DROP INDEX "Subscription_shopId_key";
ALTER TABLE "Subscription" DROP COLUMN "shopId",
DROP COLUMN "status",
ADD COLUMN "userId" TEXT NOT NULL,
ADD COLUMN "reviewsAddon" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "plan" SET DEFAULT 'start';
DROP TYPE "SubscriptionStatus";
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
-- Служебный владелец нынешних магазинов — это владелец платформы
UPDATE "User" SET "isAdmin" = true WHERE "phone" = 'local-owner';
