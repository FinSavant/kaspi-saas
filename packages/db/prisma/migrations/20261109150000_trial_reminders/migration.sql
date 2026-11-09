-- Напоминания пробным клиентам в Telegram
ALTER TABLE "Subscription" ADD COLUMN "trialSoonSentAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "trialExpiredSentAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "trialFollowUpSentAt" TIMESTAMP(3);
