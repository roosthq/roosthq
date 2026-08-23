// Auto-update verification marker, round 7 (2026-08-23) - trivial, no
// behavior change. Rounds 1-6 all got manually deployed (round 5 by
// accident) alongside real fixes before their own overnight test could run.
// Safe to remove once the auto-install feature has been confirmed working.
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module';
import { PrismaService } from './prisma.service';
import { SESSION_COOKIE } from './auth/auth.guard';
import { verifySession } from './auth/jwt';

// Deactivated accounts are locked out here rather than in AuthGuard: the guard
// is used by every module and is deliberately synchronous/DB-free, while this
// runs once, in one place, and covers kiosk tokens too. The set of inactive ids
// is cached (and refreshed lazily) so the common case costs no query at all.
const INACTIVE_TTL_MS = 15_000;

function deactivatedAccountGate(prisma: PrismaService) {
  let inactive = new Set<string>();
  let loadedAt = 0;
  let loading: Promise<void> | null = null;

  async function refresh() {
    const rows = await prisma.user.findMany({ where: { active: false }, select: { id: true } });
    inactive = new Set(rows.map((r) => r.id));
    loadedAt = Date.now();
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    // Logging out always works - otherwise a deactivated account is stuck with
    // a cookie it can neither use nor clear.
    if (req.path.endsWith('/auth/logout')) return next();
    const token = (req.headers['x-kiosk-token'] as string) ?? req.cookies?.[SESSION_COOKIE];
    if (!token) return next();
    let userId: string;
    try {
      userId = verifySession(token).userId;
    } catch {
      return next(); // invalid token - let AuthGuard produce the 401
    }
    if (Date.now() - loadedAt > INACTIVE_TTL_MS) {
      loading = loading ?? refresh().finally(() => (loading = null));
      await loading.catch(() => undefined);
    }
    if (inactive.has(userId)) {
      res.clearCookie(SESSION_COOKIE);
      return res.status(401).json({ message: 'This account has been deactivated. Ask the owner to turn it back on.' });
    }
    return next();
  };
}

async function bootstrap() {
  // Default body limit is too small for an uploaded-image data URI (base64'd prize
  // photos) - bump it. bodyParser: false so these replace Nest's defaults instead
  // of fighting them.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));
  app.use(cookieParser());
  app.use(deactivatedAccountGate(app.get(PrismaService)));
  // All routes are served under /api so a single reverse proxy (Caddy behind the
  // Cloudflare Tunnel) can route /api -> this server and / -> the frontend, keeping
  // cookies first-party.
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.WEB_URL ?? 'http://localhost:5173',
    credentials: true,
  });
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Roost HQ API listening on http://localhost:${port}`);
}

bootstrap();
