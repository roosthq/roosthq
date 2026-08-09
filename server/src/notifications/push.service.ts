import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import webpush from 'web-push';
import { PrismaService } from '../prisma.service';

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(private prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (publicKey && privateKey) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', publicKey, privateKey);
      this.enabled = true;
    } else {
      this.logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set - web push disabled');
    }
  }

  get publicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY ?? null;
  }

  private hash(endpoint: string): string {
    return createHash('sha256').update(endpoint).digest('hex');
  }

  async subscribe(userId: string, sub: PushSubscriptionInput) {
    const endpointHash = this.hash(sub.endpoint);
    await this.prisma.pushSubscription.upsert({
      where: { endpointHash },
      update: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      create: { userId, endpoint: sub.endpoint, endpointHash, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
    return { ok: true, enabled: this.enabled };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpointHash: this.hash(endpoint) } });
    return { ok: true };
  }

  // Best-effort: push to every device this person has subscribed on. A dead
  // subscription (410 Gone / 404) is pruned instead of retried forever.
  async notify(userId: string, payload: { title: string; body?: string; link?: string }) {
    if (!this.enabled) return;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (!subs.length) return;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(payload),
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
          } else {
            this.logger.warn(`push failed (${status ?? 'unknown'}): ${(err as Error).message}`);
          }
        }
      }),
    );
  }
}
