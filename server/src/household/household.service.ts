import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DisplayEventsService } from '../display/display-events.service';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// Meals / grocery / countdowns / announcements — the "kitchen wall" extras —
// plus the weekly automation crons (digest, allowance). All family-scoped;
// which of them a family actually uses is governed by Family.disabledFeatures
// (checked here for the crons; the UI gates the widgets).
@Injectable()
export class HouseholdService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private displayEvents: DisplayEventsService,
  ) {}

  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !['OWNER', 'FAMILY_MANAGER', 'ADULT'].includes(u.role)) throw new ForbiddenException('Adults only');
  }

  private async featureEnabled(familyId: string, feature: string) {
    const f = await this.prisma.family.findUnique({ where: { id: familyId }, select: { disabledFeatures: true } });
    const disabled = Array.isArray(f?.disabledFeatures) ? (f!.disabledFeatures as string[]) : [];
    return !disabled.includes(feature);
  }

  // ---- Meals ----

  meals(familyId: string, start: string, end: string) {
    return this.prisma.mealPlan.findMany({
      where: { familyId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });
  }

  async setMeal(familyId: string, actorId: string, date: string, dto: { title?: string; notes?: string | null }) {
    await this.assertAdult(actorId);
    if (!DATE_KEY.test(date)) throw new BadRequestException('Bad date');
    const title = dto.title?.trim();
    if (!title) throw new BadRequestException('Title is required');
    const meal = await this.prisma.mealPlan.upsert({
      where: { familyId_date: { familyId, date } },
      create: { familyId, date, title, notes: dto.notes?.trim() || null },
      update: { title, ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }) },
    });
    this.displayEvents.publish(familyId, { type: 'household' });
    return meal;
  }

  async deleteMeal(familyId: string, actorId: string, date: string) {
    await this.assertAdult(actorId);
    await this.prisma.mealPlan.deleteMany({ where: { familyId, date } });
    this.displayEvents.publish(familyId, { type: 'household' });
    return { ok: true };
  }

  // ---- Grocery list ----
  // Anyone in the family can add/check/remove — it's the fridge notepad.

  grocery(familyId: string) {
    return this.prisma.groceryItem.findMany({
      where: { familyId },
      orderBy: [{ checked: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async addGrocery(familyId: string, actorId: string, label: string) {
    const trimmed = label?.trim();
    if (!trimmed) throw new BadRequestException('Item is required');
    const item = await this.prisma.groceryItem.create({
      data: { familyId, label: trimmed.slice(0, 120), addedById: actorId },
    });
    this.displayEvents.publish(familyId, { type: 'household' });
    return item;
  }

  async patchGrocery(familyId: string, id: string, dto: { checked?: boolean; label?: string }) {
    const item = await this.prisma.groceryItem.findFirst({ where: { id, familyId } });
    if (!item) throw new NotFoundException('Item not found');
    const updated = await this.prisma.groceryItem.update({
      where: { id },
      data: {
        ...(dto.checked !== undefined && { checked: dto.checked, checkedAt: dto.checked ? new Date() : null }),
        ...(dto.label !== undefined && { label: dto.label.trim().slice(0, 120) || item.label }),
      },
    });
    this.displayEvents.publish(familyId, { type: 'household' });
    return updated;
  }

  async deleteGrocery(familyId: string, id: string) {
    const item = await this.prisma.groceryItem.findFirst({ where: { id, familyId } });
    if (!item) throw new NotFoundException('Item not found');
    await this.prisma.groceryItem.delete({ where: { id } });
    this.displayEvents.publish(familyId, { type: 'household' });
    return { ok: true };
  }

  async clearCheckedGrocery(familyId: string) {
    await this.prisma.groceryItem.deleteMany({ where: { familyId, checked: true } });
    this.displayEvents.publish(familyId, { type: 'household' });
    return { ok: true };
  }

  // ---- Countdowns ----

  countdowns(familyId: string) {
    return this.prisma.countdown.findMany({ where: { familyId }, orderBy: { date: 'asc' } });
  }

  async addCountdown(familyId: string, actorId: string, dto: { title: string; date: string; emoji?: string }) {
    await this.assertAdult(actorId);
    if (!dto.title?.trim()) throw new BadRequestException('Title is required');
    if (!DATE_KEY.test(dto.date ?? '')) throw new BadRequestException('Bad date');
    const c = await this.prisma.countdown.create({
      data: { familyId, title: dto.title.trim(), date: dto.date, emoji: dto.emoji?.trim() || '🎉' },
    });
    this.displayEvents.publish(familyId, { type: 'household' });
    return c;
  }

  async deleteCountdown(familyId: string, actorId: string, id: string) {
    await this.assertAdult(actorId);
    const c = await this.prisma.countdown.findFirst({ where: { id, familyId } });
    if (!c) throw new NotFoundException('Countdown not found');
    await this.prisma.countdown.delete({ where: { id } });
    this.displayEvents.publish(familyId, { type: 'household' });
    return { ok: true };
  }

  // ---- Announcements ----

  announcements(familyId: string) {
    return this.prisma.announcement.findMany({
      where: { familyId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addAnnouncement(familyId: string, actorId: string, dto: { text: string; expiresInHours?: number }) {
    await this.assertAdult(actorId);
    if (!dto.text?.trim()) throw new BadRequestException('Text is required');
    const expiresAt =
      dto.expiresInHours && dto.expiresInHours > 0
        ? new Date(Date.now() + dto.expiresInHours * 3_600_000)
        : null;
    const a = await this.prisma.announcement.create({
      data: { familyId, text: dto.text.trim().slice(0, 500), createdById: actorId, expiresAt },
    });
    this.displayEvents.publish(familyId, { type: 'household' });
    return a;
  }

  async deleteAnnouncement(familyId: string, actorId: string, id: string) {
    await this.assertAdult(actorId);
    const a = await this.prisma.announcement.findFirst({ where: { id, familyId } });
    if (!a) throw new NotFoundException('Announcement not found');
    await this.prisma.announcement.delete({ where: { id } });
    this.displayEvents.publish(familyId, { type: 'household' });
    return { ok: true };
  }

  // ---- Kiosk bundle: everything the display widgets need in one call ----

  async displayBundle(familyId: string) {
    const today = localDateKey(new Date());
    const [meals, countdowns, announcements, groceryOpen] = await Promise.all([
      this.prisma.mealPlan.findMany({
        where: { familyId, date: { gte: today } },
        orderBy: { date: 'asc' },
        take: 3,
      }),
      this.prisma.countdown.findMany({
        where: { familyId, date: { gte: today } },
        orderBy: { date: 'asc' },
        take: 4,
      }),
      this.prisma.announcement.findMany({
        where: { familyId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      this.prisma.groceryItem.count({ where: { familyId, checked: false } }),
    ]);
    return { today, meals, countdowns, announcements, groceryOpen };
  }

  // ---- Weekly automation ----

  // Weekly allowance: every Monday morning, grant each person's configured
  // allowanceTokens — unless the family turned the feature off.
  @Cron('0 7 * * 1')
  async allowanceCron() {
    const users = await this.prisma.user.findMany({
      where: { allowanceTokens: { gt: 0 }, tokensDisabled: false },
      select: { id: true, familyId: true, allowanceTokens: true },
    });
    for (const u of users) {
      if (!(await this.featureEnabled(u.familyId, 'allowance'))) continue;
      await this.prisma.tokenLedger.create({
        data: { userId: u.id, delta: u.allowanceTokens, reason: 'Weekly allowance', type: 'MANUAL', createdById: u.id },
      });
      await this.notifications.create(u.familyId, u.id, 'STREAK_BONUS', `Weekly allowance: +${u.allowanceTokens}`, {
        link: '/profile',
      });
      this.displayEvents.publish(u.familyId, { type: 'chores' });
    }
  }

  // Weekly digest: Sunday evening, tell the adults how the week went —
  // approved chore counts and tokens earned per person.
  @Cron('0 18 * * 0')
  async digestCron() {
    const families = await this.prisma.family.findMany({ select: { id: true, disabledFeatures: true } });
    const since = new Date(Date.now() - 7 * 86_400_000);
    for (const fam of families) {
      const disabled = Array.isArray(fam.disabledFeatures) ? (fam.disabledFeatures as string[]) : [];
      if (disabled.includes('digest')) continue;
      const members = await this.prisma.user.findMany({
        where: { familyId: fam.id },
        select: { id: true, displayName: true },
      });
      const parts: string[] = [];
      for (const m of members) {
        const [approved, earned] = await Promise.all([
          this.prisma.choreInstance.count({
            where: { chore: { familyId: fam.id }, claimedByUserId: m.id, status: 'APPROVED', completedAt: { gte: since } },
          }),
          this.prisma.tokenLedger.aggregate({
            where: { userId: m.id, delta: { gt: 0 }, createdAt: { gte: since } },
            _sum: { delta: true },
          }),
        ]);
        if (approved > 0 || (earned._sum.delta ?? 0) > 0) {
          parts.push(`${m.displayName}: ${approved} done, +${earned._sum.delta ?? 0}`);
        }
      }
      if (!parts.length) continue;
      await this.notifications.notifyAdults(fam.id, 'STREAK_BONUS', `This week: ${parts.join(' · ')}`, { link: '/chores' });
    }
  }
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
