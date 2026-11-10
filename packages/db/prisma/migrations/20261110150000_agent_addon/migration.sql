-- Опция «ИИ-агент» к тарифу
ALTER TABLE "Subscription" ADD COLUMN "agentAddon" BOOLEAN NOT NULL DEFAULT false;
