import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { AuditLogService } from '../security/audit-log.service';
import { DEFAULT_TIMEZONE, todayKeyInZone, timeInZone } from '../common/timezone';

const UPDATER_URL = process.env.UPDATER_URL ?? 'http://updater:4100';
const UPDATE_SHARED_SECRET = process.env.UPDATE_SHARED_SECRET;

// autoCheckHour is COMPARED against the container's own ambient clock
// (always UTC inside Docker - see autoCheckTick below), but an owner enters
// and sees it as their own wall-clock hour. Converted through the same
// DEFAULT_TIMEZONE the rest of the app already uses for chore due-times,
// not a fixed offset - correct across DST too, even though Phoenix (the
// only zone this has actually been exercised against so far) has none.
// Found the hard way: an owner set "3" expecting 3am locally and got 3am
// UTC (8pm the evening before, in Phoenix) instead - store/compare in UTC
// internally, but never make an owner do that conversion by hand.
function localHourToUtcHour(localHour: number): number {
  return timeInZone(todayKeyInZone(DEFAULT_TIMEZONE), localHour, 0, DEFAULT_TIMEZONE).getUTCHours();
}
function utcHourToLocalHour(utcHour: number): number {
  const today = todayKeyInZone(DEFAULT_TIMEZONE);
  const at = new Date(Date.UTC(today.y, today.m - 1, today.d, utcHour, 0, 0, 0));
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: DEFAULT_TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(at));
}

interface VersionInfo {
  sha: string | null;
  shortSha: string | null;
  tag: string | null;
  dirty: boolean;
}
interface CheckInfo {
  channel: 'stable' | 'latest';
  latest: string | null;
  shortLatest: string | null;
}
interface JobStatus {
  inProgress: boolean;
  lastResult: string | null;
  lastRanAt: string | null;
}

// Owner-only (deliberately the literal OWNER role, not FAMILY_MANAGER -
// this reaches git/docker on the host, a much bigger blast radius than any
// other per-family setting). A thin authenticated proxy in front of the
// `updater` service - see docker-compose.prod.yml and updater/server.js for
// where the actual git/docker work happens and why it isn't done here.
@Injectable()
export class UpdatesService {
  private readonly logger = new Logger(UpdatesService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
  ) {}

  // InstanceSettings.autoCheckHour is stored/compared in UTC; the client
  // only ever sees/sends the owner's local hour. Single point of truth for
  // that swap so status()/saveSettings() can't drift out of sync with each
  // other on which direction they're converting.
  private toClientSettings<T extends { autoCheckHour: number }>(row: T) {
    return { ...row, autoCheckHour: utcHourToLocalHour(row.autoCheckHour) };
  }

  private async assertOwner(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || u.role !== 'OWNER') throw new ForbiddenException('Owner only');
    return u;
  }

  private assertConfigured() {
    if (!UPDATE_SHARED_SECRET) {
      throw new BadRequestException('App updates are not configured on this instance - see .env.example (UPDATE_SHARED_SECRET).');
    }
  }

  private async call<T>(path: string, opts: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
    this.assertConfigured();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
    try {
      const res = await fetch(`${UPDATER_URL}${path}`, {
        method: opts.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${UPDATE_SHARED_SECRET}`,
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { message?: string }).message ?? `updater returned ${res.status}`);
      return data as T;
    } catch (e) {
      throw new BadRequestException(`Could not reach the updater service: ${(e as Error).message}`);
    } finally {
      clearTimeout(t);
    }
  }

  private async settings() {
    // Lazy-created singleton row - same "create on first touch" convention
    // as everything else in this schema that only ever has one instance-wide
    // row (no seed migration needed for instances that predate this table).
    return this.prisma.instanceSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });
  }

  // Everything the owner-facing panel needs in one call: current version,
  // latest-on-configured-channel, live job status, and saved settings -
  // same shape as nomad-eye's own single combined /update-status endpoint,
  // which the panel just polls while an install is running.
  async status(actorId: string) {
    await this.assertOwner(actorId);
    const settings = await this.settings();
    const [version, job] = await Promise.all([
      this.call<VersionInfo>('/version').catch(() => null),
      this.call<JobStatus>('/status').catch(() => null),
    ]);
    return { version, job, settings: this.toClientSettings(settings) };
  }

  async check(actorId: string) {
    await this.assertOwner(actorId);
    const settings = await this.settings();
    const channel = settings.updateChannel === 'latest' ? 'latest' : 'stable';
    const info = await this.call<CheckInfo>(`/check?channel=${channel}`);
    await this.prisma.instanceSettings.update({
      where: { id: 'singleton' },
      data: { lastCheckedAt: new Date(), lastKnownLatest: info.shortLatest },
    });
    return info;
  }

  async install(actorId: string) {
    const owner = await this.assertOwner(actorId);
    const settings = await this.settings();
    const channel = settings.updateChannel === 'latest' ? 'latest' : 'stable';
    const result = await this.call<{ started: boolean; previousCommit: string }>('/update', {
      method: 'POST',
      body: { channel },
    });
    await this.prisma.instanceSettings.update({
      where: { id: 'singleton' },
      data: { previousCommit: result.previousCommit, lastUpdateAt: new Date(), lastUpdateResult: null },
    });
    await this.audit.record({
      actorId,
      actorName: owner.displayName,
      action: 'app.update.install',
      detail: `channel: ${channel}, from: ${result.previousCommit.slice(0, 7)}`,
    });
    return result;
  }

  // One level of rollback - checks out whatever commit was captured right
  // before the most recent install (or a previous rollback). No further
  // history than that, same "one level deep" scope as the design plan.
  async rollback(actorId: string) {
    const owner = await this.assertOwner(actorId);
    const settings = await this.settings();
    if (!settings.previousCommit) {
      throw new BadRequestException('Nothing to roll back to yet - no update has been installed through this panel.');
    }
    const result = await this.call<{ started: boolean }>('/rollback', { method: 'POST', body: { commit: settings.previousCommit } });
    await this.audit.record({
      actorId,
      actorName: owner.displayName,
      action: 'app.update.rollback',
      detail: `to: ${settings.previousCommit.slice(0, 7)}`,
    });
    return result;
  }

  async saveSettings(
    actorId: string,
    // autoCheckHour arrives as the OWNER'S LOCAL hour (0-23) - converted to
    // UTC below before it's stored, since that's what autoCheckTick's own
    // clock actually reads.
    patch: { updateChannel?: 'stable' | 'latest'; autoCheckEnabled?: boolean; autoApplyEnabled?: boolean; autoCheckHour?: number },
  ) {
    await this.assertOwner(actorId);
    await this.settings(); // ensure the row exists first
    const data: Record<string, unknown> = {};
    if (patch.updateChannel) data.updateChannel = patch.updateChannel === 'latest' ? 'latest' : 'stable';
    if (patch.autoCheckEnabled !== undefined) data.autoCheckEnabled = !!patch.autoCheckEnabled;
    if (patch.autoApplyEnabled !== undefined) data.autoApplyEnabled = !!patch.autoApplyEnabled;
    if (patch.autoCheckHour !== undefined) {
      const localHour = Math.min(23, Math.max(0, Math.floor(patch.autoCheckHour)));
      data.autoCheckHour = localHourToUtcHour(localHour);
    }
    const updated = await this.prisma.instanceSettings.update({ where: { id: 'singleton' }, data });
    return this.toClientSettings(updated);
  }

  // Hourly tick, not a cron pinned to a fixed hour - autoCheckHour is owner-
  // configurable, so this just checks "is it that hour, and have we not
  // already done today's check" rather than rebuilding a cron expression at
  // runtime. Two independent gates, same as the design plan: autoCheckEnabled
  // alone only checks-and-records; autoApplyEnabled additionally installs
  // when something newer is found - a family shouldn't get a surprise
  // mid-evening restart just because "tell me about updates" was turned on.
  // Logged at every decision point on purpose - this runs unattended, once
  // an hour, and the ONE time it silently didn't fire (2026-08-22 -> 23),
  // there was nothing to check afterward: the server container that would
  // have held the evidence in memory got recreated by a later manual
  // install before anyone looked, taking its logs with it. Cheap insurance
  // against that happening twice.
  @Interval(60 * 60 * 1000)
  private async autoCheckTick() {
    if (!UPDATE_SHARED_SECRET) return;
    let settings;
    try {
      settings = await this.settings();
    } catch (e) {
      this.logger.warn(`autoCheckTick: could not read InstanceSettings - ${(e as Error).message}`);
      return;
    }
    if (!settings.autoCheckEnabled) return;
    const now = new Date();
    if (now.getUTCHours() !== settings.autoCheckHour) return;
    if (settings.lastCheckedAt && this.isSameDay(settings.lastCheckedAt, now)) {
      this.logger.log('autoCheckTick: hour matched but already checked today - skipping');
      return;
    }
    this.logger.log(`autoCheckTick: hour matched (UTC ${settings.autoCheckHour}), checking channel=${settings.updateChannel}`);

    const channel = settings.updateChannel === 'latest' ? 'latest' : 'stable';
    let info: CheckInfo;
    try {
      info = await this.call<CheckInfo>(`/check?channel=${channel}`);
    } catch (e) {
      this.logger.warn(`autoCheckTick: /check failed - ${(e as Error).message} - will retry next hour`);
      return;
    }
    await this.prisma.instanceSettings.update({
      where: { id: 'singleton' },
      data: { lastCheckedAt: now, lastKnownLatest: info.shortLatest },
    });
    this.logger.log(`autoCheckTick: latest on ${channel} = ${info.shortLatest ?? '(none found)'}`);
    if (!settings.autoApplyEnabled) {
      this.logger.log('autoCheckTick: auto-apply is off - recorded only, not installing');
      return;
    }
    if (!info.latest) {
      this.logger.log('autoCheckTick: nothing found on that channel - nothing to install');
      return;
    }

    const version = await this.call<VersionInfo>('/version').catch((e) => {
      this.logger.warn(`autoCheckTick: /version failed - ${(e as Error).message}`);
      return null;
    });
    const current = channel === 'stable' ? version?.tag : version?.shortSha;
    if (current === info.shortLatest) {
      this.logger.log(`autoCheckTick: already on ${current} - nothing to install`);
      return;
    }

    this.logger.log(`autoCheckTick: installing ${info.shortLatest} (currently ${current ?? 'unknown'})`);
    try {
      const result = await this.call<{ started: boolean; previousCommit: string }>('/update', { method: 'POST', body: { channel } });
      await this.prisma.instanceSettings.update({
        where: { id: 'singleton' },
        data: { previousCommit: result.previousCommit, lastUpdateAt: now, lastUpdateResult: null },
      });
      await this.audit.record({ actorId: 'system', actorName: 'Auto-update', action: 'app.update.install', detail: `channel: ${channel} (automatic)` });
      this.logger.log('autoCheckTick: install kicked off successfully');
    } catch (e) {
      // updater rejects a concurrent job, or is briefly unreachable - next
      // hour's tick tries again on its own.
      this.logger.warn(`autoCheckTick: /update call failed - ${(e as Error).message}`);
    }
  }

  // Explicitly UTC, matching autoCheckTick's own getUTCHours() comparison -
  // the container's ambient timezone happens to already be UTC, but this
  // shouldn't depend on that staying true.
  private isSameDay(a: Date, b: Date) {
    return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
  }
}
