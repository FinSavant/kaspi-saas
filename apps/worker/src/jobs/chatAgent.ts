import { randomUUID } from 'node:crypto';
import {
  GREETING_REPLY,
  HOLDING_MESSAGE,
  MODEL_SYSTEM_PROMPT,
  buildModelPrompt,
  classifyGroup,
  collectBuyerQuestion,
  decideAction,
  decryptSecret,
  encryptSecret,
  escalationText,
  findKnowledge,
  ownerAccess,
  needsReply,
  parseModelAnswer,
  recentTurns,
  scrubForMemory,
  underHourlyLimit,
  type ChatLang,
} from '@kaspi/core';
import { prisma } from '@kaspi/db';
import { CookieJar, KaspiCabinetAuthError, KaspiCabinetClient } from '@kaspi/kaspi-client';
import { withCabinet } from '../kaspi';
import { sendTelegramMessageWithId } from '../telegram';
import { dropDeadSession } from './reviews';

/**
 * Агент-ответчик в чате Kaspi. Тексты переписок покупателей в логи не пишем — только счётчики и id.
 */

const MAX_PER_RUN = 10;
const CONTENT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const CHAT_PATH = '/api/v1';
const MODEL_TIMEOUT_MS = 20_000;

function encryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required');
  return key;
}

/** Не больше стольких ответов агента на один диалог в час. */
function maxRepliesPerHour(): number {
  const n = Number(process.env.CHAT_AGENT_MAX_REPLIES_PER_HOUR ?? 8);
  return Number.isFinite(n) && n > 0 ? n : 8;
}

export interface ChatAgentResult {
  checked: number;
  greeted: number;
  answered: number;
  escalated: number;
  skipped: number;
  delivered: number;
  skippedReason?: string;
}

type AgentShop = Awaited<ReturnType<typeof loadShop>>;

async function loadShop(shopId: string) {
  return prisma.shop.findUniqueOrThrow({ where: { id: shopId }, include: { owner: { select: { telegramChatId: true, isAdmin: true, subscription: true } } } });
}

function clientFor(shop: { chatSessionEnc: string | null }): KaspiCabinetClient {
  if (!shop.chatSessionEnc) throw new KaspiCabinetAuthError(401, '', 'no chat session');
  return new KaspiCabinetClient(CookieJar.fromJSON(decryptSecret(shop.chatSessionEnc, encryptionKey())));
}

/** Запрос к чату; при закрытой сессии одна попытка продлить её без SMS (сохраняем новую сессию). */
async function chatCall<T = any>(client: KaspiCabinetClient, shopId: string, merchantId: string, path: string, body: unknown): Promise<T> {
  try {
    return await client.chat<T>(path, body, merchantId);
  } catch (error) {
    if (!(error instanceof KaspiCabinetAuthError) || !(await client.refreshSession())) throw error;
    await prisma.shop.update({ where: { id: shopId }, data: { chatSessionEnc: encryptSecret(client.jar.toJSON(), encryptionKey()) } });
    return client.chat<T>(path, body, merchantId);
  }
}

async function sendText(client: KaspiCabinetClient, shop: { id: string; merchantId: string }, groupId: string, text: string): Promise<void> {
  const response = await chatCall<any>(client, shop.id, shop.merchantId, `${CHAT_PATH}/messages/sendMessage`, {
    created: Date.now(),
    data: { text },
    messageId: randomUUID().toUpperCase(),
    groupId,
    transitionContextUrl: `https://pay.kaspi.kz/chat?threadId=${groupId}&isWeb=true`,
  });
  if (response?.status === 'rejected') throw new Error(String(response?.alert?.alertMessage ?? 'Kaspi не пропустил сообщение').slice(0, 200));
}

/** Описание и характеристики товара из карточки Kaspi — запрос details, раз в 14 дней. */
export async function ensureProductContent(shop: AgentShop, product: { id: string; kaspiSku: string; contentSyncedAt: Date | null }, now = new Date()): Promise<void> {
  if (product.contentSyncedAt && now.getTime() - product.contentSyncedAt.getTime() < CONTENT_TTL_MS) return;
  try {
    const details = await withCabinet(shop, (cabinet) => cabinet.getOfferDetails(shop.merchantId, product.kaspiSku));
    const master = details?.masterProduct;
    const description: string | null =
      (typeof master?.description === 'string' && master.description.trim()) || (typeof master?.descriptions?.[0]?.text === 'string' && master.descriptions[0].text.trim()) || null;
    await prisma.product.update({
      where: { id: product.id },
      data: {
        description,
        specifications: Array.isArray(master?.specifications) ? master.specifications : undefined,
        contentSyncedAt: now,
      },
    });
  } catch (error) {
    console.warn('[chat-agent] product content failed:', error instanceof Error ? error.message : error);
  }
}

/** Ответ модели Claude; без ключа или при ошибке — null (тогда вопрос уходит владельцу). */
async function askModel(prompt: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.CHAT_AGENT_MODEL || 'claude-haiku-5-5',
        max_tokens: 400,
        system: MODEL_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[chat-agent] model request failed: ${res.status}`);
      return null;
    }
    const json: any = await res.json();
    const text = (json?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
    return text || null;
  } catch (error) {
    console.warn('[chat-agent] model error:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Диалог → товар (и заказ). PRODUCTS: analytics.order_id = masterSku; ORDERS: номер заказа. */
async function resolveContext(shop: AgentShop, kind: 'PRODUCT' | 'ORDER', key: string) {
  if (kind === 'PRODUCT') {
    const product = key ? await prisma.product.findFirst({ where: { shopId: shop.id, kaspiMasterSku: key } }) : null;
    return { product, order: null };
  }
  const order = key
    ? await prisma.order.findUnique({
        where: { shopId_code: { shopId: shop.id, code: key } },
        include: { items: { include: { product: true } } },
      })
    : null;
  const product = order?.items.find((i) => i.product)?.product ?? null;
  return { product, order };
}

async function escalate(
  shop: AgentShop,
  p: { groupId: string; messageId: string; question: string; reason: string; masterSku: string | null; productName: string | null },
): Promise<void> {
  const chatId = shop.owner.telegramChatId;
  let telegramMsgId: string | null = null;
  if (chatId && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      telegramMsgId = await sendTelegramMessageWithId(
        chatId,
        escalationText({ shopName: shop.name, productName: p.productName, question: p.question, reason: p.reason }),
      );
    } catch (error) {
      console.warn('[chat-agent] telegram failed:', error instanceof Error ? error.message : error);
    }
  }
  await prisma.chatEscalation
    .create({
      data: {
        shopId: shop.id,
        groupId: p.groupId,
        messageId: p.messageId,
        question: scrubForMemory(p.question),
        masterSku: p.masterSku,
        productName: p.productName,
        telegramChatId: chatId ?? null,
        telegramMsgId,
      },
    })
    .catch(() => undefined);
}

/** Проход по диалогам одного магазина: ответ на каждое новое сообщение покупателя. */
export async function runChatAgentForShop(shopId: string, now = new Date()): Promise<ChatAgentResult> {
  const result: ChatAgentResult = { checked: 0, greeted: 0, answered: 0, escalated: 0, skipped: 0, delivered: 0 };
  const shop = await loadShop(shopId);
  if (!shop.chatAgentEnabled || !shop.chatAgentEnabledAt || !shop.chatSessionEnc) return { ...result, skippedReason: 'выключено' };
  // Агент — отдельная опция: тариф истёк, отзывов или агента нет в тарифе — агент стоит, настройки сохраняются
  const access = ownerAccess(shop.owner, now);
  if (!access.reviewsAllowed || !access.agentAllowed) return { ...result, skippedReason: 'не входит в тариф' };
  const client = clientFor(shop);

  try {
    // Ответы владельца, которые не успели уйти (потерянная задача, сбой связи)
    result.delivered += await deliverPending(shop, client);

    const data = await chatCall<any>(client, shop.id, shop.merchantId, `${CHAT_PATH}/group/loadGroups/chat`, { limit: 25, gts: Number.MAX_SAFE_INTEGER });
    const groups: any[] = data?.groups ?? [];
    const lastIds = groups.map((g) => (g?.lastMessage?.id ? String(g.lastMessage.id) : '')).filter(Boolean);
    const handled = new Set(
      (await prisma.chatAgentReply.findMany({ where: { shopId: shop.id, messageId: { in: lastIds } }, select: { messageId: true } })).map((r) => r.messageId),
    );
    const todo = groups.filter((g) => needsReply(g, { enabledAt: shop.chatAgentEnabledAt!, handledMessageIds: handled })).slice(0, MAX_PER_RUN);
    result.checked = todo.length;

    for (const group of todo) {
      const messageId = String(group.lastMessage.id);
      const groupId = String(group.id);
      // Сначала запись в базу: уникальный ключ не даст ответить на одно сообщение дважды
      let record;
      try {
        record = await prisma.chatAgentReply.create({ data: { shopId: shop.id, groupId, messageId, kind: 'PENDING' } });
      } catch {
        continue;
      }
      const finish = (kind: string) => prisma.chatAgentReply.update({ where: { id: record.id }, data: { kind } });
      // Если сообщение покупателю уже ушло, запись удалять нельзя — иначе ответим повторно
      let sent = false;
      const send = async (text: string) => {
        await sendText(client, shop, groupId, text);
        sent = true;
      };

      try {
        const history = await chatCall<any>(client, shop.id, shop.merchantId, `${CHAT_PATH}/history/loadMoreMessages`, { limit: 10, groupId });
        const messages: any[] = history?.messages ?? [];
        const question = collectBuyerQuestion(messages);
        if (!question) {
          await finish('SKIPPED');
          result.skipped++;
          continue;
        }
        const cls = classifyGroup(group) ?? { kind: 'ORDER' as const, key: '' };
        const { product, order } = await resolveContext(shop, cls.kind, cls.key);
        const masterSku = product?.kaspiMasterSku ?? (cls.kind === 'PRODUCT' ? cls.key : null);
        const productName = product?.name ?? (typeof group.title === 'string' ? group.title.slice(0, 120) : null);

        const repliesLastHour = await prisma.chatAgentReply.count({
          where: { shopId: shop.id, groupId, kind: { in: ['ANSWERED', 'GREETING', 'HOLDING'] }, createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
        });
        const canReply = underHourlyLimit(repliesLastHour, maxRepliesPerHour());
        const action = decideAction(question);

        const escalateWith = async (reason: string, lang: ChatLang) => {
          // «Уточню» уходит покупателю сразу — иначе страдает рейтинг по скорости ответа
          if (canReply) await send(HOLDING_MESSAGE[lang]);
          await escalate(shop, { groupId, messageId, question: question.text, reason, masterSku, productName });
          await finish(canReply ? 'HOLDING' : 'SKIPPED');
          result.escalated++;
        };

        if (action.type === 'greeting') {
          if (canReply) await send(GREETING_REPLY[action.lang]);
          await finish(canReply ? 'GREETING' : 'SKIPPED');
          result.greeted++;
          continue;
        }
        if (action.type === 'escalate') {
          await escalateWith(action.reason, action.lang);
          continue;
        }

        if (product) await ensureProductContent(shop, product, now);
        const fresh = product ? await prisma.product.findUnique({ where: { id: product.id } }) : null;
        const memory = await prisma.chatKnowledge.findMany({ where: { shopId: shop.id, active: true }, orderBy: { createdAt: 'desc' }, take: 300 });
        const known = findKnowledge(question.text, memory, { masterSku });

        const prompt = buildModelPrompt({
          question: question.text,
          turns: recentTurns(messages),
          lang: action.lang,
          shopName: shop.name,
          product: fresh ? { name: fresh.name, description: fresh.description, specifications: fresh.specifications } : null,
          order: order
            ? {
                status: order.status,
                plannedDeliveryDate: order.plannedDeliveryDate ? order.plannedDeliveryDate.toISOString().slice(0, 10) : null,
                items: order.items.map((i) => `${i.name} × ${i.quantity}`),
              }
            : null,
          knowledge: known.map((k) => ({ question: k.question, answer: k.answer })),
        });
        const parsed = parseModelAnswer((await askModel(prompt)) ?? '');
        if (!parsed) {
          await escalateWith('no-answer', action.lang);
          continue;
        }
        if (!canReply) {
          await finish('SKIPPED');
          result.skipped++;
          continue;
        }
        await send(parsed.answer);
        await finish('ANSWERED');
        if (parsed.source === 'owner' && known[0]) {
          await prisma.chatKnowledge.update({ where: { id: known[0].id }, data: { uses: { increment: 1 } } }).catch(() => undefined);
        }
        result.answered++;
      } catch (error) {
        if (error instanceof KaspiCabinetAuthError) throw error;
        // Сбой на одном диалоге: сообщение считается необработанным — попробуем в следующий проход
        if (sent) await finish('ANSWERED').catch(() => undefined);
        else await prisma.chatAgentReply.delete({ where: { id: record.id } }).catch(() => undefined);
        console.warn(`[chat-agent] group ${groupId} failed:`, error instanceof Error ? error.message : error);
      }
    }
  } catch (error) {
    if (!(error instanceof KaspiCabinetAuthError)) throw error;
    await dropDeadSession(shopId);
    return { ...result, skippedReason: 'сессия чата закрыта' };
  }
  return result;
}

/** Ответ владельца → покупателю в чат + запись в память. Идемпотентно по статусу escalation. */
export async function deliverOwnerAnswer(escalationId: string): Promise<boolean> {
  const claimed = await prisma.chatEscalation.updateMany({ where: { id: escalationId, status: 'ANSWERED' }, data: { status: 'DELIVERING' } });
  if (claimed.count === 0) return false;
  const esc = await prisma.chatEscalation.findUniqueOrThrow({ where: { id: escalationId } });
  const shop = await loadShop(esc.shopId);
  try {
    if (!esc.answer) throw new Error('empty answer');
    // Память: следующий похожий вопрос агент закроет сам
    await prisma.chatKnowledge.create({
      data: { shopId: shop.id, question: esc.question, answer: esc.answer, masterSku: esc.masterSku, productName: esc.productName },
    });
    await sendText(clientFor(shop), shop, esc.groupId, esc.answer);
    await prisma.chatEscalation.update({ where: { id: esc.id }, data: { status: 'DELIVERED', error: null } });
    await prisma.chatAgentReply.create({ data: { shopId: shop.id, groupId: esc.groupId, messageId: `owner:${esc.id}`, kind: 'DELIVERED' } }).catch(() => undefined);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.chatEscalation.update({ where: { id: esc.id }, data: { status: 'FAILED', error: message.slice(0, 300) } });
    if (error instanceof KaspiCabinetAuthError) await dropDeadSession(shop.id);
    return false;
  }
}

/** Ответы владельца, зависшие в ANSWERED (задача потерялась), доставляем при очередном проходе. */
async function deliverPending(shop: AgentShop, _client: KaspiCabinetClient): Promise<number> {
  const stuck = await prisma.chatEscalation.findMany({
    where: { shopId: shop.id, status: 'ANSWERED', answeredAt: { lt: new Date(Date.now() - 60_000) } },
    select: { id: true },
    take: 5,
  });
  let delivered = 0;
  for (const e of stuck) if (await deliverOwnerAnswer(e.id)) delivered++;
  return delivered;
}

let polling = false;

/** Проход по всем магазинам, где агент включён; наложение проходов (долгий проход) пропускаем. */
export async function runChatAgent(): Promise<(ChatAgentResult & { shopId: string; error?: string })[]> {
  if (polling) return [];
  polling = true;
  try {
    return await runAllShops();
  } finally {
    polling = false;
  }
}

async function runAllShops(): Promise<(ChatAgentResult & { shopId: string; error?: string })[]> {
  const shops = await prisma.shop.findMany({ where: { chatAgentEnabled: true, chatSessionEnc: { not: null } }, select: { id: true } });
  const results = [];
  for (const shop of shops) {
    try {
      results.push({ shopId: shop.id, ...(await runChatAgentForShop(shop.id)) });
    } catch (error) {
      results.push({ shopId: shop.id, checked: 0, greeted: 0, answered: 0, escalated: 0, skipped: 0, delivered: 0, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
