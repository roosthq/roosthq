// Session cookies must be Secure whenever the app is served over HTTPS - not
// only when NODE_ENV happens to be "production" (a self-hoster who copied
// .env.example keeps NODE_ENV=development but is still behind HTTPS).
const WEB_URL = process.env.WEB_URL ?? '';

export const COOKIE_SECURE = process.env.NODE_ENV === 'production' || WEB_URL.startsWith('https://');

export const cookieBase = { httpOnly: true, sameSite: 'lax' as const, secure: COOKIE_SECURE };
