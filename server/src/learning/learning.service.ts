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
const TOKENS_PER_CORRECT = 1;

// v1 default all-correct bonus pool - not yet adult-customizable per
// subject/session the way MiniGame's pool editor is. Flagging the gap
// rather than silently hardcoding it forever: PLANNING.md §19 build order
// item for later is to expose this in the grade-settings UI.
const BONUS_POOL: PoolEntry[] = [{ kind: 'TOKENS', min: 5, max: 15, weight: 1 }];

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

    const buyer = await this.prisma.user.findUnique({ where: { id: userId }, select: { tokensDisabled: true } });
    let tokensAwarded = 0;
    if (correct && !buyer?.tokensDisabled) {
      tokensAwarded = TOKENS_PER_CORRECT;
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
      if (allCorrect) {
        const result = this.draw(BONUS_POOL);
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
          bonusPoolJson: BONUS_POOL as unknown as Prisma.InputJsonValue,
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
