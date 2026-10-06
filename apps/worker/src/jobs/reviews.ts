import { randomUUID } from 'node:crypto';
import {
  DEFAULT_TEMPLATES,
  NOT_SOLD_STATUSES,
  decryptSecret,
  encryptSecret,
  renderTemplate,
  withinHours,
  type ReviewMessageKind,
} from '@kaspi/core';
import { prisma } from '@kaspi/db';
import { CookieJar, KaspiCabinetAuthError, KaspiCabinetClient } from '@kaspi/kaspi-client';
import { sendTelegramMessage } from '../telegram';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Не больше стольких сообщений за один проход — чтобы не засыпать чат после паузы. */
const MAX_SENDS_PER_RUN = 30;
const SEND_PAUSE_MS = 1500;
/** Сколько страниц диалогов (по 25) просматривать в поисках диалога заказа. */
const MAX_GROUP_PAGES = 10;

export interface ReviewsResult {
  sent: number;
  failed: number;
  noChat: number;
  replies: number;
  skipped?: string;
}

function encryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required');
  return key;
}

/**
 * Рассылка магазина в чат Kaspi: приветствие новым заказам и просьба об отзыве
 * выданным (через reviewDelayHours). Только заказы после включения рассылки и
 * только в рабочие часы. Каждое сообщение сначала записывается в базу — повторно
 * то же сообщение тому же заказу не уйдёт, даже если отправка оборвалась.
 */
export async function sendReviewMessages(shopId: string, now = new Date()): Promise<ReviewsResult> {
  try {
    return await sendWithSession(shopId, now);
  } catch (error) {
    if (!(error instanceof KaspiCabinetAuthError)) throw error;
    await dropDeadSession(shopId);
    throw error;
  }
}

/**
 * Сессия чата держится только на SMS-входе, без кода её не вернуть. Когда Kaspi
 * её закрыл — убираем её, чтобы в «Настройках» снова был вход, и пишем владельцу в Telegram.
 */
async function dropDeadSession(shopId: string) {
  const shop = await prisma.shop.update({
    where: { id: shopId },
    data: { chatSessionEnc: null },
    select: { name: true, owner: { select: { telegramChatId: true } } },
  });
  const chatId = shop.owner.telegramChatId;
  if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return;
  await sendTelegramMessage(
    chatId,
    `⚠️ ${shop.name}: Kaspi закрыл вход в чат — рассылка «Отзывов» остановлена.\nЗайдите в «Настройки» → «Чат с покупателями» и войдите по номеру ещё раз (код из SMS).`,
  ).catch(() => undefined);
}

async function sendWithSession(shopId: string, now: Date): Promise<ReviewsResult> {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
  const result: ReviewsResult = { sent: 0, failed: 0, noChat: 0, replies: 0 };
  if (!shop.reviewsEnabled || !shop.chatSessionEnc || !shop.reviewsEnabledAt) return { ...result, skipped: 'выключено' };

  const client = new KaspiCabinetClient(CookieJar.fromJSON(decryptSecret(shop.chatSessionEnc, encryptionKey())));
  const enabledAt = shop.reviewsEnabledAt;
  const done = new Set(
    (await prisma.reviewMessage.findMany({ where: { shopId, sentAt: { gte: new Date(now.getTime() - 14 * DAY_MS) } }, select: { orderCode: true, kind: true } }))
      .map((m) => `${m.kind}:${m.orderCode}`),
  );
  const include = { items: { select: { name: true, product: { select: { name: true, kaspiMasterSku: true } } } } } as const;

  const queue: { kind: ReviewMessageKind; order: Awaited<ReturnType<typeof loadOrders>>[number] }[] = [];
  async function loadOrders(where: object) {
    return prisma.order.findMany({ where: { shopId, ...where }, include, orderBy: { createdAtKaspi: 'asc' }, take: 100 });
  }
  if (shop.newOrderMessages) {
    const fresh = await loadOrders({
      createdAtKaspi: { gte: new Date(Math.max(enabledAt.getTime(), now.getTime() - 2 * DAY_MS)) },
      status: { notIn: [...NOT_SOLD_STATUSES] },
      itemsSyncedAt: { not: null },
    });
    for (const order of fresh) if (!done.has(`NEW_ORDER:${order.code}`)) queue.push({ kind: 'NEW_ORDER', order });
  }
  if (shop.reviewMessages) {
    const delivered = await loadOrders({
      status: 'COMPLETED',
      completedAt: {
        gte: new Date(Math.max(enabledAt.getTime(), now.getTime() - 7 * DAY_MS)),
        lte: new Date(now.getTime() - shop.reviewDelayHours * 60 * 60 * 1000),
      },
    });
    for (const order of delivered) if (!done.has(`REVIEW:${order.code}`)) queue.push({ kind: 'REVIEW', order });
  }
  const waitingReply = await prisma.reviewMessage.findMany({
    where: { shopId, status: 'SENT', repliedAt: null, sentAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
  });
  if (queue.length === 0 && waitingReply.length === 0) {
    // Пустой запрос каждые 2 минуты держит сессию живой: без обращений Kaspi закрыл её за несколько часов
    await chatWithRefresh(client, '/api/v1/group/loadGroups/chat', { limit: 1, gts: Number.MAX_SAFE_INTEGER }, shop.merchantId);
    await saveSession(shopId, client);
    return result;
  }

  // Диалоги магазина: у каждого заказа Kaspi свой диалог, номер заказа — в analytics.order_id
  const groups = new Map<string, any>();
  const wanted = new Set([...queue.map((q) => q.order.code), ...waitingReply.map((m) => m.orderCode)]);
  let gts = Number.MAX_SAFE_INTEGER;
  for (let page = 0; page < MAX_GROUP_PAGES && [...wanted].some((c) => !groups.has(c)); page++) {
    const data = await chatWithRefresh(client, '/api/v1/group/loadGroups/chat', { limit: 25, gts }, shop.merchantId);
    const list: any[] = data?.groups ?? [];
    for (const g of list) if (g?.analytics?.order_id) groups.set(String(g.analytics.order_id), g);
    if (!data?.more || list.length === 0) break;
    gts = Math.min(...list.map((g) => Number(g.gts)));
  }

  // Ответил ли покупатель после нашего сообщения — последний в диалоге написал он
  for (const m of waitingReply) {
    const last = groups.get(m.orderCode)?.lastMessage;
    if (last?.sender === 'messenger' && Number(last.created) > m.sentAt.getTime()) {
      await prisma.reviewMessage.update({ where: { id: m.id }, data: { repliedAt: new Date(Number(last.created)) } });
      result.replies++;
    }
  }

  if (!withinHours(now, shop.reviewHoursFrom, shop.reviewHoursTo)) {
    await saveSession(shopId, client);
    return { ...result, skipped: 'нерабочие часы' };
  }

  for (const { kind, order } of queue.slice(0, MAX_SENDS_PER_RUN)) {
    // Диалог по заказу появляется, только когда кто-то начал переписку, — иначе открываем его
    // сами, как кнопка «Написать покупателю» на странице заказа в кабинете
    const group =
      groups.get(order.code) ??
      (await client
        .chat<any>('/api/v1/group/startChat', { id: order.code, type: 'CLIENT_SELLER_BY_ORDER' }, shop.merchantId)
        .catch((error) => {
          if (error instanceof KaspiCabinetAuthError) throw error;
          return null;
        }));
    if (!group?.id) {
      // Kaspi мог ещё не завести заказ в чат — для свежих заказов попробуем в следующий раз
      if (kind === 'NEW_ORDER' && now.getTime() - order.createdAtKaspi.getTime() < 6 * 60 * 60 * 1000) continue;
      await prisma.reviewMessage.create({ data: { shopId, orderCode: order.code, kind, status: 'NO_CHAT' } }).catch(() => undefined);
      result.noChat++;
      continue;
    }
    const template = (kind === 'NEW_ORDER' ? shop.newOrderTemplate : shop.reviewTemplate) ?? DEFAULT_TEMPLATES[kind];
    const text = renderTemplate(
      template,
      {
        code: order.code,
        customerName: order.customerName,
        plannedDeliveryDate: order.plannedDeliveryDate,
        // Название карточки Kaspi понятнее покупателю, чем название из прайс-листа продавца
        items: order.items.map((i) => ({ name: i.product?.name ?? i.name, masterSku: i.product?.kaspiMasterSku ?? null })),
      },
      shop.name,
      now,
    );

    // Сначала запись в базу: уникальный ключ не даст отправить то же сообщение дважды
    let record;
    try {
      record = await prisma.reviewMessage.create({ data: { shopId, orderCode: order.code, kind, status: 'SENDING', groupId: String(group.id) } });
    } catch {
      continue;
    }
    try {
      const groupId = String(group.id);
      const response = await client.chat<any>(
        '/api/v1/messages/sendMessage',
        {
          created: Date.now(),
          data: { text },
          messageId: randomUUID().toUpperCase(),
          groupId,
          transitionContextUrl: `https://pay.kaspi.kz/chat?threadId=${groupId}&isWeb=true`,
        },
        shop.merchantId,
      );
      if (response?.status === 'rejected') {
        await prisma.reviewMessage.update({
          where: { id: record.id },
          data: { status: 'REJECTED', error: String(response?.alert?.alertMessage ?? 'Kaspi не пропустил сообщение').slice(0, 300) },
        });
        result.failed++;
      } else {
        await prisma.reviewMessage.update({ where: { id: record.id }, data: { status: 'SENT', sentAt: new Date() } });
        result.sent++;
      }
    } catch (error) {
      await prisma.reviewMessage.update({
        where: { id: record.id },
        data: { status: 'FAILED', error: (error instanceof Error ? error.message : String(error)).slice(0, 300) },
      });
      result.failed++;
    }
    await new Promise((resolve) => setTimeout(resolve, SEND_PAUSE_MS));
  }

  await saveSession(shopId, client);
  return result;
}

/** Запрос к чату; если Kaspi не узнал сессию — одна попытка продлить её через сервис входа. */
async function chatWithRefresh(client: KaspiCabinetClient, path: string, body: unknown, merchantId: string): Promise<any> {
  try {
    return await client.chat<any>(path, body, merchantId);
  } catch (error) {
    if (!(error instanceof KaspiCabinetAuthError) || !(await client.refreshSession())) throw error;
    return client.chat<any>(path, body, merchantId);
  }
}

/** Куки чата обновляются в ответах — сохраняем, чтобы сессия жила дольше. */
async function saveSession(shopId: string, client: KaspiCabinetClient) {
  await prisma.shop.update({ where: { id: shopId }, data: { chatSessionEnc: encryptSecret(client.jar.toJSON(), encryptionKey()) } });
}
