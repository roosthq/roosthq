import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface SearchHit {
  id: string;
  label: string;
  sublabel?: string;
  link: string;
}

export interface SearchResult {
  chores: SearchHit[];
  events: SearchHit[];
  notifications: SearchHit[];
  rules: SearchHit[];
  prizes: SearchHit[];
  awards: SearchHit[];
}

const PER_CATEGORY_LIMIT = 8;

function isAdult(role: string) {
  return role === 'OWNER' || role === 'FAMILY_MANAGER' || role === 'ADULT';
}

// Global search across the app's own data. Deliberately does NOT reach into
// Google Calendar - those events live on Google's servers, not in our DB,
// and querying Google's API per keystroke would be slow and rate-limit-risky.
// Local calendars (LocalEvent) ARE indexed since they're ours to query.
@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(familyId: string, userId: string, q: string): Promise<SearchResult> {
    const query = q.trim();
    const empty: SearchResult = { chores: [], events: [], notifications: [], rules: [], prizes: [], awards: [] };
    if (query.length < 2) return empty;

    const actor = await this.prisma.user.findUnique({ where: { id: userId } });
    const adult = !!actor && isAdult(actor.role);

    const [chores, events, notifications, rules, prizes, awards] = await Promise.all([
      this.prisma.chore.findMany({
        where: { familyId, title: { contains: query } },
        include: { location: { select: { name: true } } },
        take: PER_CATEGORY_LIMIT,
      }),
      this.prisma.localEvent.findMany({
        where: { title: { contains: query }, calendar: { familyId } },
        include: { calendar: { select: { name: true } } },
        orderBy: { startAt: 'asc' },
        take: PER_CATEGORY_LIMIT,
      }),
      // Own notifications only, regardless of role - never surface a
      // sibling's or another adult's notification through search.
      this.prisma.notification.findMany({
        where: { familyId, userId, title: { contains: query } },
        orderBy: { createdAt: 'desc' },
        take: PER_CATEGORY_LIMIT,
      }),
      this.prisma.rule.findMany({
        where: {
          familyId,
          text: { contains: query },
          ...(adult ? {} : { OR: [{ targetUserId: null }, { targetUserId: userId }] }),
        },
        take: PER_CATEGORY_LIMIT,
      }),
      this.prisma.prize.findMany({
        where: { familyId, name: { contains: query }, archived: false },
        take: PER_CATEGORY_LIMIT,
      }),
      // Award catalog page is adult+-only in the app, so keep it out of a
      // kid's search results too rather than exposing an otherwise-hidden page.
      adult
        ? this.prisma.award.findMany({
            where: { familyId, name: { contains: query } },
            take: PER_CATEGORY_LIMIT,
          })
        : Promise.resolve([]),
    ]);

    return {
      chores: chores.map((c) => ({
        id: c.id,
        label: c.title,
        sublabel: c.location?.name,
        link: '/chores',
      })),
      events: events.map((e) => ({
        id: e.id,
        label: e.title,
        sublabel: `${e.calendar.name} - ${e.startAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        link: '/',
      })),
      notifications: notifications.map((n) => ({
        id: n.id,
        label: n.title,
        sublabel: n.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        link: '/notifications',
      })),
      rules: rules.map((r) => ({
        id: r.id,
        label: r.text,
        link: '/rules',
      })),
      prizes: prizes.map((p) => ({
        id: p.id,
        label: p.name,
        link: '/store',
      })),
      awards: awards.map((a) => ({
        id: a.id,
        label: a.name,
        link: '/awards',
      })),
    };
  }
}
