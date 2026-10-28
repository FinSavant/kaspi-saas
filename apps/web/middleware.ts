import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from './lib/session';

// Открыты без входа: страница о сервисе, вход, регистрация и файлы для поисковиков
const PUBLIC_PATHS = ['/', '/login', '/register', '/robots.txt', '/sitemap.xml'];

/** Без куки сессии — на страницу входа. Действительность сессии проверяет api. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|.*\\.(?:png|svg|jpg|ico)$).*)'],
};
