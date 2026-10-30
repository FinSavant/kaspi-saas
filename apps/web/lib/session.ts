/** Кука с токеном сессии продавца; httpOnly, в браузерный JS не попадает. */
export const SESSION_COOKIE = 'sanq_session';
/** Заголовок, в котором веб-кабинет передаёт токен в api. */
export const SESSION_HEADER = 'x-user-session';
/** Помечает запросы веб-кабинета в api: без сессии им открыты только /auth/*. */
export const WEB_CLIENT_HEADER = 'x-web-client';
