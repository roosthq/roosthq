import type { NextFunction, Request, Response } from 'express';

// A small, dependency-free per-IP limiter for the endpoints an anonymous
// attacker can reach: password login/registration/reset, Google sign-in, and
// kiosk PIN unlock. Fixed window, in memory (one server instance). It is a
// backstop on top of the per-account lockouts: those protect one account from
// guessing, this protects the server (scrypt is CPU-heavy) and the mailer
// from being hammered by one source.
interface Rule {
  match: RegExp;
  limit: number;
  windowMs: number;
}

const MINUTE = 60_000;

const RULES: Rule[] = [
  { match: /^\/api\/auth\/local\/forgot-password$/, limit: 5, windowMs: 15 * MINUTE },
  { match: /^\/api\/auth\/local\/(login|register|reset-password)$/, limit: 20, windowMs: 5 * MINUTE },
  { match: /^\/api\/auth\/google/, limit: 40, windowMs: 5 * MINUTE },
  { match: /^\/api\/display\/unlock$/, limit: 40, windowMs: 5 * MINUTE },
];

const hits = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, v] of hits) if (v.resetAt <= now) hits.delete(key);
}, MINUTE).unref();

// Behind Cloudflare Tunnel + Caddy the socket address is the proxy, so the
// real client is in CF-Connecting-IP. The server itself is never published to
// the network (docker-compose.prod.yml), so that header can't be spoofed by
// anything that doesn't already go through the tunnel.
function clientIp(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf;
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'OPTIONS') return next();
  const rule = RULES.find((r) => r.match.test(req.path));
  if (!rule) return next();
  const key = `${rule.match.source}|${clientIp(req)}`;
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + rule.windowMs });
    return next();
  }
  entry.count += 1;
  if (entry.count > rule.limit) {
    res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).json({ message: 'Too many attempts. Please wait a few minutes and try again.' });
  }
  return next();
}
