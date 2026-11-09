function botUrl(method: string): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function call(method: string, body: FormData): Promise<void> {
  const res = await fetch(botUrl(method), { method: 'POST', body });
  if (!res.ok) throw new Error(`Telegram ${method} failed with ${res.status}: ${await res.text()}`);
}

/** Кнопка под сообщением: нажатие приходит боту как callback с `data`. */
export interface TelegramButton {
  text: string;
  data?: string;
  /** Кнопка-ссылка (например WhatsApp): вместо callback открывает адрес. */
  url?: string;
}

export async function sendTelegramMessage(chatId: string, text: string, buttons: TelegramButton[] = []): Promise<void> {
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('text', text);
  if (buttons.length) {
    form.set('reply_markup', JSON.stringify({ inline_keyboard: buttons.map((b) => [b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }]) }));
  }
  await call('sendMessage', form);
}

export async function sendTelegramDocument(
  chatId: string,
  bytes: Uint8Array,
  filename: string,
  caption: string,
): Promise<void> {
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('caption', caption);
  form.set('document', new Blob([Buffer.from(bytes)], { type: 'application/pdf' }), filename);
  await call('sendDocument', form);
}

/** То же, но возвращает id сообщения: владелец отвечает на него реплаем (вопросы агента-ответчика). */
export async function sendTelegramMessageWithId(chatId: string, text: string): Promise<string | null> {
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('text', text);
  const res = await fetch(botUrl('sendMessage'), { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Telegram sendMessage failed with ${res.status}`);
  const json: any = await res.json().catch(() => null);
  const id = json?.result?.message_id;
  return id === undefined || id === null ? null : String(id);
}
