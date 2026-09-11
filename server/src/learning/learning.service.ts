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

  // Priority-ordered, not fully random - Casey's own instruction: resurface
  // questions this kid has gotten wrong before (and hasn't since fixed)
  // ahead of everything else, so a session actually works toward "answered
  // everything right eventually" instead of just cycling. Priority:
  // 1. still-wrong (EduQuestionProgress.correct === false)
  // 2. never attempted at all
  // 3. already-mastered, oldest-mastered first (fallback once the other
  //    two buckets are empty - e.g. this kid has genuinely gotten
  //    everything right and is just waiting to be promoted a grade)
  private async pickQuestions(subject: string, grade: number, userId: string, excludeIds: string[], count: number) {
    const all = await this.prisma.eduQuestion.findMany({ where: { subject, grade, active: true } });
    if (!all.length) throw new BadRequestException(`No ${subject} questions yet for grade ${grade}`);
    const excluded = new Set(excludeIds);
    const progress = await this.prisma.eduQuestionProgress.findMany({ where: { userId, subject, grade } });
    const progressById = new Map(progress.map((p) => [p.questionId, p]));

    const shuffle = <T>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);
    const stillWrong = shuffle(all.filter((q) => !excluded.has(q.id) && progressById.get(q.id)?.correct === false));
    const neverTried = shuffle(all.filter((q) => !excluded.has(q.id) && !progressById.has(q.id)));
    const mastered = all
      .filter((q) => !excluded.has(q.id) && progressById.get(q.id)?.correct === true)
      .sort((a, b) => (progressById.get(a.id)?.updatedAt.getTime() ?? 0) - (progressById.get(b.id)?.updatedAt.getTime() ?? 0));

    const picked: typeof all = [];
    for (const bucket of [stillWrong, neverTried, mastered]) {
      for (const q of bucket) {
        if (picked.length >= count) break;
        picked.push(q);
      }
      if (picked.length >= count) break;
    }
    // Bank smaller than `count` even across every bucket (tiny seed data) -
    // top up with whatever's left, excluded ids included, rather than
    // shortchanging the block.
    if (picked.length < count) {
      for (const q of all) {
        if (picked.length >= count) break;
        if (!picked.some((p) => p.id === q.id)) picked.push(q);
      }
    }
    return picked.slice(0, count);
  }

  // Answer is deliberately withheld from what's sent to the client - a kid
  // reading the network tab shouldn't be able to see it before answering.
  private presentQuestion(q: { id: string; type: string; prompt: string; choicesJson: unknown; visualJson: unknown }) {
    return { id: q.id, type: q.type, prompt: q.prompt, choices: q.choicesJson ?? null, visual: q.visualJson ?? null };
  }

  // Casey's own instruction, 2026-09: answering every active question in
  // the current grade's bank correctly auto-promotes to the next grade -
  // an earned bump, distinct from (and layered on top of) the birthday-
  // seeded default (see UserSubjectGrade's own comment on why that's not a
  // contradiction). Checked against `grade` as SNAPSHOT ON THE SESSION, not
  // whatever UserSubjectGrade says right now - same "don't retroactively
  // change what a session already asked" rule the grade snapshot exists for.
  private async maybePromote(userId: string, subject: string, grade: number): Promise<number | null> {
    if (grade >= 6) return null;
    const totalActive = await this.prisma.eduQuestion.count({ where: { subject, grade, active: true } });
    if (totalActive === 0) return null;
    const masteredCount = await this.prisma.eduQuestionProgress.count({ where: { userId, subject, grade, correct: true } });
    if (masteredCount < totalActive) return null;
    const newGrade = grade + 1;
    await this.prisma.userSubjectGrade.upsert({
      where: { userId_subject: { userId, subject } },
      create: { userId, subject, grade: newGrade, setById: userId },
      update: { grade: newGrade, setById: userId },
    });
    return newGrade;
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

    // Durable per-question outcome - powers next time's question selection
    // (resurface if still wrong) and grade auto-promotion (mastered every
    // active question this grade). Recorded on every answer regardless of
    // whether the session itself ever gets finished.
    await this.prisma.eduQuestionProgress.upsert({
      where: { userId_questionId: { userId, questionId } },
      create: { userId, questionId, subject: session.subject, grade: session.grade, correct },
      update: { correct, attempts: { increment: 1 } },
    });

    const settings = await this.ensureSettings(familyId, userId);
    const buyer = await this.prisma.user.findUnique({ where: { id: userId }, select: { tokensDisabled: true } });
    // This question's own share, for the live "N so far" counter - NOT
    // written to the ledger here. Real payout happens once, at DONE, below
    // (Casey's own instruction: finishing is what makes it real).
    const tokensAwarded = correct && !buyer?.tokensDisabled ? settings.tokensPerCorrect : 0;

    const blockCount = rounds.filter((r) => r.block === session.status).length;

    // Block B just completed - finalize the session: roll the all-correct
    // bonus, write the ONE real ledger entry for everything earned this
    // session, check for grade auto-promotion.
    if (blockCount >= BLOCK_SIZE && session.status === 'BLOCK_B') {
      const allCorrect = rounds.every((r) => r.correct);
      const correctCount = rounds.filter((r) => r.correct).length;
      // session.tokensAwarded is the running tally from every PRIOR answer
      // this session (kept live for the UI); + this answer's own share =
      // the full session total, paid out in one shot right here.
      const totalQuestionTokens = session.tokensAwarded + tokensAwarded;
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
        }
      }
      const ledgerTotal = totalQuestionTokens + bonusTokens;
      if (ledgerTotal > 0) {
        await this.prisma.tokenLedger.create({
          data: {
            userId,
            delta: ledgerTotal,
            reason: `Learning games: ${session.subject} - session complete (${correctCount}/${rounds.length} correct)${bonusTokens > 0 ? ', perfect bonus' : ''}`,
            type: 'EDU_GAME',
            refId: session.id,
            createdById: userId,
          },
        });
      }
      const promotedTo = await this.maybePromote(userId, session.subject, session.grade);
      await this.prisma.eduSession.update({
        where: { id: session.id },
        data: {
          status: 'DONE',
          roundsJson: rounds as unknown as Prisma.InputJsonValue,
          tokensAwarded: totalQuestionTokens + bonusTokens,
          allCorrect,
          bonusPoolJson: bonusPool as unknown as Prisma.InputJsonValue,
          bonusWonPrizeId: bonusPrizeId,
          finishedAt: new Date(),
        },
      });
      this.displayEvents.publish(familyId, { type: 'tokens' });
      // tokensAwarded here is THIS question's own delta, same contract as
      // every other answer() call - the client accumulates it locally into
      // its own running total, which by now already equals
      // totalQuestionTokens without the server needing to re-send it.
      // bonusTokens is separate and additive, shown as its own line.
      return { correct, correctAnswer: question.answer, tokensAwarded, phase: 'DONE', allCorrect, bonusTokens, bonusPrizeId, promotedTo };
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

  // ---------------- Progress (adult-only) ----------------

  // Per-subject mastery snapshot + the actual list of questions this kid is
  // currently getting wrong (Casey's own request - "see each kid's
  // progress, wrong questions, answer stats" without having to eyeball a
  // live session). `correct` on EduQuestionProgress is the LATEST attempt
  // only (see that model's own comment), so "wrong" here means "wrong
  // right now", not "ever missed once" - a question gotten right since
  // drops off this list on its own.
  async getProgress(familyId: string, actorId: string, targetUserId: string) {
    await this.assertAdult(actorId);
    const target = await this.prisma.user.findFirst({ where: { id: targetUserId, familyId } });
    if (!target) throw new NotFoundException('Family member not found');

    const grades = await this.prisma.userSubjectGrade.findMany({ where: { userId: targetUserId } });
    const gradeBySubject = new Map(grades.map((g) => [g.subject, g.grade]));

    const subjects: Record<string, unknown> = {};
    for (const subject of SUBJECTS) {
      const grade = gradeBySubject.get(subject) ?? this.defaultGrade(target.birthday);
      const bankSize = await this.prisma.eduQuestion.count({ where: { subject, grade, active: true } });
      const progress = await this.prisma.eduQuestionProgress.findMany({ where: { userId: targetUserId, subject, grade } });
      const wrong = progress.filter((p) => !p.correct);
      const mastered = progress.filter((p) => p.correct);
      const wrongQuestions = wrong.length
        ? await this.prisma.eduQuestion.findMany({
            where: { id: { in: wrong.map((w) => w.questionId) } },
            select: { id: true, type: true, prompt: true, choicesJson: true, answer: true },
          })
        : [];
      const wrongById = new Map(wrong.map((w) => [w.questionId, w]));
      subjects[subject] = {
        grade,
        bankSize,
        masteredCount: mastered.length,
        wrongCount: wrong.length,
        untriedCount: Math.max(0, bankSize - progress.length),
        accuracyPct: progress.length ? Math.round((mastered.length / progress.length) * 100) : null,
        wrongQuestions: wrongQuestions.map((q) => ({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          choices: q.choicesJson ?? null,
          correctAnswer: q.answer,
          attempts: wrongById.get(q.id)?.attempts ?? 1,
        })),
      };
    }

    const sessions = await this.prisma.eduSession.findMany({
      where: { userId: targetUserId },
      orderBy: { startedAt: 'desc' },
      take: 15,
    });
    const recentSessions = sessions.map((s) => {
      const rounds = (s.roundsJson as unknown as EduRound[]) ?? [];
      return {
        id: s.id,
        subject: s.subject,
        grade: s.grade,
        status: s.status,
        correctCount: rounds.filter((r) => r.correct).length,
        totalCount: rounds.length,
        tokensAwarded: s.tokensAwarded,
        allCorrect: s.allCorrect,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
      };
    });

    return { userId: target.id, displayName: target.displayName, subjects, recentSessions };
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
