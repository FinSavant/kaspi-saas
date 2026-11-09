-- Агент-ответчик в чате Kaspi
ALTER TABLE "Shop" ADD COLUMN "chatAgentEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shop" ADD COLUMN "chatAgentEnabledAt" TIMESTAMP(3);

ALTER TABLE "Product" ADD COLUMN "description" TEXT;
ALTER TABLE "Product" ADD COLUMN "specifications" JSONB;
ALTER TABLE "Product" ADD COLUMN "contentSyncedAt" TIMESTAMP(3);

CREATE TABLE "ChatAgentReply" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatAgentReply_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatEscalation" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "masterSku" TEXT,
    "productName" TEXT,
    "telegramChatId" TEXT,
    "telegramMsgId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "answer" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    CONSTRAINT "ChatEscalation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatKnowledge" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "masterSku" TEXT,
    "productName" TEXT,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatKnowledge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatAgentReply_shopId_messageId_key" ON "ChatAgentReply"("shopId", "messageId");
CREATE INDEX "ChatAgentReply_shopId_groupId_createdAt_idx" ON "ChatAgentReply"("shopId", "groupId", "createdAt");
CREATE UNIQUE INDEX "ChatEscalation_shopId_messageId_key" ON "ChatEscalation"("shopId", "messageId");
CREATE INDEX "ChatEscalation_telegramChatId_telegramMsgId_idx" ON "ChatEscalation"("telegramChatId", "telegramMsgId");
CREATE INDEX "ChatEscalation_shopId_status_idx" ON "ChatEscalation"("shopId", "status");
CREATE INDEX "ChatKnowledge_shopId_active_idx" ON "ChatKnowledge"("shopId", "active");

ALTER TABLE "ChatAgentReply" ADD CONSTRAINT "ChatAgentReply_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatEscalation" ADD CONSTRAINT "ChatEscalation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatKnowledge" ADD CONSTRAINT "ChatKnowledge_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
