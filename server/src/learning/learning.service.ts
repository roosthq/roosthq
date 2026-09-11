import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { DisplayEventsService } from '../display/display-events.service';
import { assertFeatureEnabled } from '../common/features';
import { DEFAULT_TIMEZONE, todayKeyInZone } from '../common/timezone';
import type { PoolEntry } from '../reward-games/reward-games.service';

// Educational games (PLANNING.md §19) - a real knowledge quiz, right/wrong
// checked server-side against EduQuestion.answer, never trusted from the
// client the way MiniGameGrant/Purchase trust PlayReport.won (those pay out
// on a pre-drawn chance result independent of skill; this pays out because
// the answer was actually right).
export const SUBJECTS = ['MATH', 'READING', 'SCIENCE', 'SPELLING'];
const BLOCK_SIZE = 5;

// Fallback only for a family whose LearningGamesSettings row doesn't exist
// yet (ensureSettings creates one on first read/write using these) - not a
// live constant read at answer time anymore. Casey's 2026-09 feedback: these
// were hardcoded with no adult control at all; now family-wide settings,
// same additive-field philosophy as everything else here means going
// per-subject later is a column, not a rewrite.
const DEFAULT_TOKENS_PER_CORRECT = 1;
const DEFAULT_BONUS_POOL: PoolEntry[] = [{ kind: 'TOKENS', min: 5, max: 15, weight: 1 }];

type DrawnResult = { kind: 'TOKENS'; amount: number } | { kind: 'PRIZE'; prizeId: string };

type EduRound = { block: 'BLOCK_A' | 'BLOCK_B'; questionId: string; given: string; correct: boolean };

@Injectable()
export class LearningService {
  constructor(
    private prisma: PrismaService,
    private displayEvents: DisplayEventsService,
  ) {}

  private isAdult(role: string) {
    return role === 'OWNER' || role === 'FAMILY_MANAGER' || role === 'ADULT';
  }

  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || !this.isAdult(u.role)) throw new ForbiddenException('Adults only');
    return u;
  }

  private sanitizeSubject(s: unknown): string {
    if (typeof s === 'string' && SUBJECTS.includes(s)) return s;
    throw new BadRequestException('Unknown subject');
  }

  // Same never-trust-the-client-blindly shape as MiniGamesService's own
  // sanitizePool (deliberately duplicated there too, for the same reason:
  // the two features have no other coupling worth a shared import over).
  private sanitizePool(input: unknown): PoolEntry[] {
    if (!Array.isArray(input) || input.length === 0) throw new BadRequestException('A prize pool is required');
    const out: PoolEntry[] = [];
    for (const raw of input) {
      if (!raw || typeof raw !== 'object') continue;
      const p = raw as Record<string, unknown>;
      const weight = typeof p.weight === 'number' && p.weight > 0 ? p.weight : 1;
      if (p.kind === 'TOKENS' && typeof p.min === 'number' && typeof p.max === 'number') {
        out.push({ kind: 'TOKENS', min: Math.max(0, Math.floor(p.min)), max: Math.max(0, Math.floor(p.max)), weight });
      } else if (p.kind === 'STREAK_FREEZE' && typeof p.min === 'number' && typeof p.max === 'number') {
        out.push({ kind: 'STREAK_FREEZE', min: Math.max(1, Math.floor(p.min)), max: Math.max(1, Math.floor(p.max)), weight });
      } else if (p.kind === 'PRIZE' && typeof p.prizeId === 'string' && p.prizeId) {
        out.push({ kind: 'PRIZE', prizeId: p.prizeId, weight });
      }
    }
    if (!out.length) throw new BadRequestException('A prize pool is required');
    return out;
  }

  // Rough default when no adult-set grade exists yet: age 5 ~= kindergarten
  // (grade 0), one grade per year after. Deliberately approximate - an
  // adult setting the real grade in Settings always wins once they do.
  private defaultGrade(birthday: string | null): number {
    if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return 2;
    const [by, bm, bd] = birthday.split('-').map(Number);
    const today = todayKeyInZone(DEFAULT_TIMEZONE);
    let age = today.y - by;
    if (today.m < bm || (today.m === bm && today.d < bd)) age--;
    return Math.max(0, Math.min(6, age - 5));
  }

  // Same weighted-pick logic as MiniGamesService.draw - deliberately
  // duplicated rather than shared (same call as that file's own
  // sanitizePool comment: the two features have no other coupling, and
  // this is small enough that sharing would cost more than copying).
  private draw(pool: PoolEntry[]): DrawnResult {
    const totalWeight = pool.reduce((s, p) => s + (p.weight ?? 1), 0);
    let r = Math.random() * totalWeight;
    let picked: PoolEntry = pool[pool.length - 1];
    for (const p of pool) {
      r -= p.weight ?? 1;
      if (r <= 0) {
        picked = p;
        break;
      }
    }
    if (picked.kind === 'PRIZE') return { kind: 'PRIZE', prizeId: picked.prizeId };
    const amount = picked.min + Math.floor(Math.random() * (picked.max - picked.min + 1));
    return { kind: 'TOKENS', amount };
  }

  // ---------------- Grade settings (adult-only) ----------------

  async listGrades(familyId: string, actorId: string) {
    await this.assertAdult(actorId);
    const kids = await this.prisma.user.findMany({
      where: { familyId, role: 'KID' },
      select: { id: true, displayName: true, birthday: true },
    });
    const grades = await this.prisma.userSubjectGrade.findMany({ where: { userId: { in: kids.map((k) => k.id) } } });
    const byUser = new Map<string, Record<string, number>>();
    for (const g of grades) {
      const bucket = byUser.get(g.userId) ?? {};
      bucket[g.subject] = g.grade;
      byUser.set(g.userId, bucket);
    }
    return kids.map((k) => ({
      userId: k.id,
      displayName: k.displayName,
      subjects: Object.fromEntries(SUBJECTS.map((s) => [s, byUser.get(k.id)?.[s] ?? this.defaultGrade(k.birthday)])),
    }));
  }

  async setGrade(familyId: string, actorId: string, targetUserId: string, subject: string, grade: number) {
    await assertFeatureEnabled(this.prisma, familyId, 'learningGames');
    await this.assertAdult(actorId);
    const subj = this.sanitizeSubject(subject);
    const target = await this.prisma.user.findFirst({ where: { id: targetUserId, familyId } });
    if (!target) throw new NotFoundException('Family member not found');
    const g = Math.max(0, Math.min(6, Math.floor(grade)));
    return this.prisma.userSubjectGrade.upsert({
      where: { userId_subject: { userId: targetUserId, subject: subj } },
      create: { userId: targetUserId, subject: subj, grade: g, setById: actorId },
      update: { grade: g, setById: actorId },
    });
  }

  // ---------------- Payout settings (adult-only) ----------------

  // Created lazily on first read/write with the DEFAULT_* constants, same
  // "checked and repaired on every fetch" spirit as MiniGamesService's
  // ensureDefaultCatalog - a family that never touches this gets the exact
  // previous hardcoded behavior, not a crash.
  private async ensureSettings(familyId: string, actorId: string) {
    const existing = await this.prisma.learningGamesSettings.findUnique({ where: { familyId } });
    if (existing) return existing;
    return this.prisma.learningGamesSettings.create({
      data: {
        familyId,
        tokensPerCorrect: DEFAULT_TOKENS_PER_CORRECT,
        bonusPoolJson: DEFAULT_BONUS_POOL as unknown as Prisma.InputJsonValue,
        updatedById: actorId,
      },
    });
  }

  async getSettings(familyId: string, actorId: string) {
    await this.assertAdult(actorId);
    const s = await this.ensureSettings(familyId, actorId);
    return { tokensPerCorrect: s.tokensPerCorrect, bonusPool: s.bonusPoolJson as unknown as PoolEntry[] };
  }

  async updateSettings(familyId: string, actorId: string, tokensPerCorrect: number, bonusPool: unknown) {
    await this.assertAdult(actorId);
    await this.ensureSettings(familyId, actorId);
    const pool = this.sanitizePool(bonusPool);
    const tpc = Math.max(0, Math.floor(tokensPerCorrect));
    await this.prisma.learningGamesSettings.update({
      where: { familyId },
      data: { tokensPerCorrect: tpc, bonusPoolJson: pool as unknown as Prisma.InputJsonValue, updatedById: actorId },
    });
    return { tokensPerCorrect: tpc, bonusPool: pool };
  }

  // ---------------- Sessions (kid-facing) ----------------

  private async myGrade(userId: string, familyId: string, subject: string): Promise<number> {
    const existing = await this.prisma.userSubjectGrade.findUnique({ where: { userId_subject: { userId, subject } } });
    if (existing) return existing.grade;
    const u = await this.prisma.user.findFirst({ where: { id: userId, familyId } });
    return this.defaultGrade(u?.birthday ?? null);
  }

  // Least-recently-asked, not fully random - otherwise a 20-question bank
  // repeats the same handful constantly. Looks at this user's last 5
  // sessions for this subject to build an exclude set; falls back to the
  // full bank once it's actually exhausted rather than erroring.
  private async pickQuestions(subject: string, grade: number, userId: string, excludeIds: string[], count: number) {
    const recentSessions = await this.prisma.eduSession.findMany({
      where: { userId, subject },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: { roundsJson: true },
    });
    const recentlyAsked = new Set<string>(excludeIds);
    for (const s of recentSessions) {
      for (const r of (s.roundsJson as unknown as EduRound[]) ?? []) {
        if (r?.questionId) recentlyAsked.add(r.questionId);
      }
    }
    const all = await this.prisma.eduQuestion.findMany({ where: { subject, grade, active: true } });
    if (!all.length) throw new BadRequestException(`No ${subject} questions yet for grade ${grade}`);
    const fresh = all.filter((q) => !recentlyAsked.has(q.id));
    const pool = fresh.length >= count ? fresh : all;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  // Answer is deliberately withheld from what's sent to the client - a kid
  // reading the network tab shouldn't be able to see it before answering.
  private presentQuestion(q: { id: string; type: string; prompt: string; choicesJson: unknown }) {
    return { id: q.id, type: q.type, prompt: q.prompt, choices: q.choicesJson ?? null };
  }

  private async owned(userId: string, id: string) {
    const s = await this.prisma.eduSession.findFirst({ where: { id, userId } });
    if (!s) throw new NotFoundException('Session not found');
    return s;
  }

  async startSession(familyId: string, userId: string, subject: string) {
    await assertFeatureEnabled(this.prisma, familyId, 'learningGames');
    const subj = this.sanitizeSubject(subject);
    const grade = await this.myGrade(userId, familyId, subj);
    const questions = await this.pickQuestions(subj, grade, userId, [], BLOCK_SIZE);
    const session = await this.prisma.eduSession.create({ data: { userId, subject: subj, grade, status: 'BLOCK_A' } });
    return { sessionId: session.id, subject: subj, grade, phase: 'BLOCK_A', questions: questions.map((q) => this.presentQuestion(q)) };
  }

  private normalize(s: string): string {
    return (s ?? '').trim().toLowerCase();
  }

  async answer(familyId: string, userId: string, sessionId: string, questionId: string, given: string) {
    await assertFeatureEnabled(this.prisma, familyId, 'learningGames');
    const session = await this.owned(userId, sessionId);
    if (session.status !== 'BLOCK_A' && session.status !== 'BLOCK_B') {
      throw new BadRequestException('Session is not accepting answers right now');
    }
    const question = await this.prisma.eduQuestion.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException('Question not found');
    const correct = this.normalize(given) === this.normalize(question.answer);

    const rounds = ((session.roundsJson as unknown as EduRound[]) ?? []).slice();
    rounds.push({ block: session.status as 'BLOCK_A' | 'BLOCK_B', questionId, given, correct });

    const settings = await this.ensureSettings(familyId, userId);
    const buyer = await this.prisma.user.findUnique({ where: { id: userId }, select: { tokensDisabled: true } });
    let tokensAwarded = 0;
    if (correct && !buyer?.tokensDisabled) {
      tokensAwarded = settings.tokensPerCorrect;
      await this.prisma.tokenLedger.create({
        data: { userId, delta: tokensAwarded, reason: `Learning games: ${session.subject} - correct answer`, type: 'EDU_GAME', refId: session.id, createdById: userId },
      });
    }

    const blockCount = rounds.filter((r) => r.block === session.status).length;

    // Block B just completed - finalize the session (all-correct bonus roll).
    if (blockCount >= BLOCK_SIZE && session.status === 'BLOCK_B') {
      const allCorrect = rounds.every((r) => r.correct);
      let bonusTokens = 0;
      let bonusPrizeId: string | null = null;
      const bonusPool = settings.bonusPoolJson as unknown as PoolEntry[];
      if (allCorrect) {
        const result = this.draw(bonusPool);
        if (result.kind === 'PRIZE') {
          bonusPrizeId = result.prizeId;
          await this.prisma.redemption.create({ data: { prizeId: result.prizeId, userId, status: 'FULFILLED', source: 'GAME' } });
        } else if (!buyer?.tokensDisabled) {
          bonusTokens = result.amount;
          await this.prisma.tokenLedger.create({
            data: { userId, delta: bonusTokens, reason: `Learning games: ${session.subject} - perfect session bonus`, type: 'EDU_GAME', refId: session.id, createdById: userId },
          });
        }
      }
      await this.prisma.eduSession.update({
        where: { id: session.id },
        data: {
          status: 'DONE',
          roundsJson: rounds as unknown as Prisma.InputJsonValue,
          tokensAwarded: { increment: tokensAwarded + bonusTokens },
          allCorrect,
          bonusPoolJson: bonusPool as unknown as Prisma.InputJsonValue,
          bonusWonPrizeId: bonusPrizeId,
          finishedAt: new Date(),
        },
      });
      this.displayEvents.publish(familyId, { type: 'tokens' });
      return { correct, correctAnswer: question.answer, tokensAwarded, phase: 'DONE', allCorrect, bonusTokens, bonusPrizeId };
    }

    // Block A just completed - hand off to the arcade break; block B's
    // questions are drawn fresh by advance(), not here.
    const newStatus = blockCount >= BLOCK_SIZE && session.status === 'BLOCK_A' ? 'BREAK' : session.status;
    await this.prisma.eduSession.update({
      where: { id: session.id },
      data: { status: newStatus, roundsJson: rounds as unknown as Prisma.InputJsonValue, tokensAwarded: { increment: tokensAwarded } },
    });
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return { correct, correctAnswer: question.answer, tokensAwarded, phase: newStatus };
  }

  async advance(familyId: string, userId: string, sessionId: string) {
    await assertFeatureEnabled(this.prisma, familyId, 'learningGames');
    const session = await this.owned(userId, sessionId);
    if (session.status !== 'BREAK') throw new BadRequestException('Not on a break right now');
    const rounds = (session.roundsJson as unknown as EduRound[]) ?? [];
    const usedIds = rounds.map((r) => r.questionId);
    const questions = await this.pickQuestions(session.subject, session.grade, userId, usedIds, BLOCK_SIZE);
    await this.prisma.eduSession.update({ where: { id: session.id }, data: { status: 'BLOCK_B' } });
    return { phase: 'BLOCK_B', questions: questions.map((q) => this.presentQuestion(q)) };
  }
}
