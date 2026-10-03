function botUrl(method: string): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function call(method: string, body: FormData): Promise<void> {
  const res = await fetch(botUrl(method), { method: 'POST', body });
  if (!res.ok) throw new Error(`Telegram ${method} failed with ${res.status}: ${await res.text()}`);
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('text', text);
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
