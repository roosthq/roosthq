import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { DisplayEventsService } from '../display/display-events.service';
import { assertFeatureEnabled } from '../common/features';
import { DEFAULT_TIMEZONE, todayKeyInZone, startOfDayInZone } from '../common/timezone';
import { paginate, parsePageParams } from '../common/pagination';
import type { PoolEntry } from '../reward-games/reward-games.service';
import { MEDIA_SPEC, customMediaId, customMediaPath, decodeDataUri, isStaticMediaPath, parseImage, parseWav } from './media-validate';

// Broad-strokes emoji detector (pictographs, emoticons, symbols, flags, the
// variation-selector/ZWJ that stitch compound emoji together) - not a
// formally complete Unicode-emoji test, but every ordinary emoji a keyboard
// picker would insert lands in one of these ranges. Only ever applied to a
// TEXT_INPUT answer (Casey's own rule: emoji are fine in a prompt or a
// multiple-choice option, never in something a kid has to type back).
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}⭐❤️‍]/u;

// Photo/sound attached to a question. Paths are either a built-in file
// ("learning/img/lion.webp") or an uploaded one ("api/learning/media/<id>").
export interface EduMediaInput {
  image?: string | null;
  audio?: string | null;
  alt?: string | null;
  choiceImages?: string[] | null; // IMAGE_CHOICE only, 2-4, one per choice letter
  choiceAlts?: string[] | null;
}

export interface EduQuestionInput {
  subject: string;
  grade: number;
  type: 'MULTIPLE_CHOICE' | 'TEXT_INPUT' | 'IMAGE_CHOICE';
  prompt: string;
  choices?: string[]; // MULTIPLE_CHOICE (text) / IMAGE_CHOICE (derived letters)
  answer: string;
  acceptedAnswers?: string[]; // TEXT_INPUT only
  // undefined = leave as is (on update), null = remove all media
  media?: EduMediaInput | null;
  active?: boolean;
}

const CHOICE_LETTERS = ['A', 'B', 'C', 'D'];

// Educational games (PLANNING.md §19) - a real knowledge quiz, right/wrong
// checked server-side against EduQuestion.answer, never trusted from the
// client the way MiniGameGrant/Purchase trust PlayReport.won (those pay out
// on a pre-drawn chance result independent of skill; this pays out because
// the answer was actually right).
export const SUBJECTS = ['MATH', 'READING', 'SCIENCE', 'SPELLING', 'LOGIC', 'SOCIAL', 'BIOLOGY'];
const BLOCK_SIZE = 5;

// What a kid must have mastered (latest answer right) to move up a grade:
// 90% of the grade's active questions, but never more than PROMOTE_CAP. Was
// "every single one" while a grade had ~110 questions. With 250-400 a grade
// (photos, sounds and diagrams on top of text), demanding even 90% would turn
// one grade into months and the last stragglers into a grind - the wrong/new
// weighting already keeps surfacing them - so the bar is bounded, while the
// bank stays big enough that a kid keeps meeting fresh questions long after.
const PROMOTE_FRACTION = 0.9;
const PROMOTE_CAP = 150;
const promoteTarget = (totalActive: number) => Math.min(Math.ceil(totalActive * PROMOTE_FRACTION), PROMOTE_CAP);
// At the TOP of the ladder (nothing higher to promote into) the cap doesn't
// apply: the kid keeps playing regular full-pay sessions on the unseen/wrong
// questions until they've mastered 90% of the bank, only then Explore & Review.
const topOfLadderTarget = (totalActive: number) => Math.ceil(totalActive * PROMOTE_FRACTION);

// Explore & Review pays this fraction of the normal per-question rate (floored
// per session) - below-grade questions are easy tokens otherwise.
const REVIEW_PAY_FRACTION = 0.5;
// A grade's Monster Den monster is befriended by mastering that grade to the
// same bar that promotes a kid past it (promoteTarget; topOfLadderTarget on the
// top grade) - one monster per grade has to mean the whole grade, not one good
// session. Sticky once earned (EduMonsterFriend).
//
// Monster Hunt: replaying a grade BELOW the kid's current one to collect its
// monster. Pays this fraction of the normal per-question rate on newly
// mastered questions, by how many grades down it is; 0 = free. Two or more
// grades down is practice-for-the-monster only.
const huntPayFraction = (gradesBelow: number) => (gradesBelow <= 1 ? 0.25 : gradesBelow === 2 ? 0.1 : 0);

// Fallback only for a family whose LearningGamesSettings row doesn't exist
// yet (ensureSettings creates one on first read/write using these) - not a
// live constant read at answer time anymore. Casey's 2026-09 feedback: these
// were hardcoded with no adult control at all; now family-wide settings,
// same additive-field philosophy as everything else here means going
// per-subject later is a column, not a rewrite.
const DEFAULT_TOKENS_PER_CORRECT = 1;
const GRADE_NAMES = ['Kindergarten', '1st grade', '2nd grade', '3rd grade', '4th grade', '5th grade', '6th grade'];
// One-time prize for befriending a monster: 5 correct-answers' worth per
// grade step (K = 5x, 6th = 35x of tokensPerCorrect). Paid exactly once ever
// per monster, only when a played session unlocks it (never by self-heal).
const monsterUnlockBonus = (tokensPerCorrect: number, grade: number) => Math.max(0, Math.floor(tokensPerCorrect)) * 5 * (grade + 1);
const DEFAULT_BONUS_POOL: PoolEntry[] = [{ kind: 'TOKENS', min: 5, max: 15, weight: 1 }];

type DrawnResult = { kind: 'TOKENS'; amount: number } | { kind: 'PRIZE'; prizeId: string };

type EduRound = { block: 'BLOCK_A' | 'BLOCK_B'; questionId: string; given: string; correct: boolean; fresh?: boolean };

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

  // EduQuestion has no familyId - it's the ONE shared curriculum every
  // family on the instance plays from (see the model's own comment).
  // Editing it changes what every family sees, so this is gated tighter
  // than the rest of Learning's "any adult" admin surface - same
  // instance-level Role.OWNER-only gate HolidaysService.assertOwner uses
  // for its own shared, cross-family resource.
  private async assertOwner(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || u.role !== 'OWNER') throw new ForbiddenException('Owner only');
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
    return { tokensPerCorrect: s.tokensPerCorrect, bonusPool: s.bonusPoolJson as unknown as PoolEntry[], dailySessionCap: s.dailySessionCap };
  }

  async updateSettings(familyId: string, actorId: string, tokensPerCorrect: number, bonusPool: unknown, dailySessionCap?: number | null) {
    await this.assertAdult(actorId);
    await this.ensureSettings(familyId, actorId);
    const pool = this.sanitizePool(bonusPool);
    const tpc = Math.max(0, Math.floor(tokensPerCorrect));
    // null/undefined = no cap (matches every family's current behavior,
    // no hardcoded fallback - Casey's own instruction); anything else
    // clamps to a real positive count.
    const cap = dailySessionCap == null ? null : Math.max(1, Math.floor(dailySessionCap));
    await this.prisma.learningGamesSettings.update({
      where: { familyId },
      data: { tokensPerCorrect: tpc, bonusPoolJson: pool as unknown as Prisma.InputJsonValue, dailySessionCap: cap, updatedById: actorId },
    });
    return { tokensPerCorrect: tpc, bonusPool: pool, dailySessionCap: cap };
  }

  // How many REWARDED sessions (practiceOnly: false, any subject combined)
  // this kid has already finished today, in DEFAULT_TIMEZONE - the count
  // startSession compares against dailySessionCap. A practiceOnly session
  // doesn't count against itself (it was never going to pay out anyway),
  // so hitting the cap is permanent for the rest of the day, not something
  // more practice sessions could accidentally "use up" further.
  private async rewardedSessionsToday(userId: string, excludeSubject?: string): Promise<number> {
    const dayStart = startOfDayInZone(todayKeyInZone(DEFAULT_TIMEZONE), DEFAULT_TIMEZONE);
    const [done, inFlight] = await Promise.all([
      this.prisma.eduSession.count({ where: { userId, status: 'DONE', practiceOnly: false, mode: { not: 'HUNT' }, finishedAt: { gte: dayStart } } }),
      // Sessions already started (in any OTHER subject) but not finished also
      // use up a slot - otherwise a kid could open all seven subjects before
      // finishing any, and every one of them would count as the "first".
      this.prisma.eduSession.count({
        where: {
          userId,
          status: { in: ['BLOCK_A', 'BREAK', 'BLOCK_B'] },
          practiceOnly: false,
          mode: { not: 'HUNT' },
          startedAt: { gte: dayStart },
          ...(excludeSubject ? { subject: { not: excludeSubject } } : {}),
        },
      }),
    ]);
    return done + inFlight;
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
  // Weighted by BUCKET, not by individual question - drawing per-item would
  // get diluted the moment the bank is mostly mastered (a large bank like
  // Social/Logic's 110/grade means "mastered" can easily be 100+ items
  // against a handful of wrong/untried ones; per-item weighting there still
  // mostly draws from the huge bucket even at a steep per-item ratio).
  // Weighting the BUCKET itself keeps the proportion constant regardless of
  // how many questions sit in each one - still random (Casey's own
  // instruction: "they can still be random, those 2 just need higher
  // weight"), but wrong/untried stay dominant all the way to the last few
  // questions in a grade, which is exactly when a kid most needs to actually
  // land on them to finish. Replaces the old strict bucket-FILL (100%
  // priority order, mastered never touched at all until wrong+untried ran
  // dry) with something that still leans hard the same way without being
  // fully deterministic.
  private static readonly WEIGHT_WRONG = 5;
  private static readonly WEIGHT_NEW = 3;
  private static readonly WEIGHT_MASTERED = 1;
  // Below-grade questions the kid never saw (or still has wrong) - e.g. new
  // content added to a grade they already passed. Gentle, and capped per
  // block so catching up can't swamp the grade they're actually working on.
  private static readonly WEIGHT_CATCHUP = 2;
  private static readonly CATCHUP_MAX_PER_BLOCK = 1;

  // Per slot: a weighted lottery over whichever buckets still have items
  // left (buckets already shuffled by the caller), draws that bucket's next
  // item. A bucket running dry just drops out of future rolls instead of
  // ever handing back a duplicate.
  private pickWeightedBuckets<T>(buckets: { items: T[]; weight: number; max?: number }[], count: number): T[] {
    const state = buckets.map((b) => ({ pool: [...b.items], weight: b.weight, left: b.max ?? Infinity }));
    const picked: T[] = [];
    while (picked.length < count) {
      const available = state.filter((s) => s.pool.length && s.left > 0);
      if (!available.length) break;
      const total = available.reduce((s, b) => s + b.weight, 0);
      let r = Math.random() * total;
      let chosen = available[available.length - 1];
      for (const b of available) {
        r -= b.weight;
        if (r <= 0) {
          chosen = b;
          break;
        }
      }
      picked.push(chosen.pool.pop() as T);
      chosen.left--;
    }
    return picked;
  }

  // No more than two of the same kind of question in a row (typed, plain
  // multiple choice, photo, sound, picture-choice), so a block keeps changing
  // shape instead of feeling like one worksheet. Greedy and order-preserving
  // otherwise - the weighted draw above still decides WHICH questions.
  private varietyOrder<T extends { type: string; mediaJson?: unknown }>(qs: T[]): T[] {
    const kind = (q: T) => {
      const m = q.mediaJson as { audio?: string; image?: string; choiceImages?: string[] } | null | undefined;
      return `${q.type}:${m?.audio ? 'a' : m?.choiceImages ? 'c' : m?.image ? 'p' : 't'}`;
    };
    const left = [...qs];
    const out: T[] = [];
    while (left.length) {
      const a = out.length >= 2 ? kind(out[out.length - 1]) : null;
      const b = out.length >= 2 ? kind(out[out.length - 2]) : null;
      const i = left.findIndex((q) => !(a && a === b && kind(q) === a));
      out.push(left.splice(i >= 0 ? i : 0, 1)[0]);
    }
    return out;
  }

  private async pickQuestions(subject: string, grade: number, userId: string, excludeIds: string[], count: number, mode: string = 'NORMAL') {
    return this.varietyOrder(await this.pickQuestionsRaw(subject, grade, userId, excludeIds, count, mode));
  }

  private async pickQuestionsRaw(subject: string, grade: number, userId: string, excludeIds: string[], count: number, mode: string = 'NORMAL') {
    const excluded = new Set(excludeIds);
    const shuffle = <T>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

    if (mode === 'REVIEW' || mode === 'HUNT') {
      // Explore & Review: everything at or below the top grade the kid hasn't
      // gotten right yet (never seen, or still wrong); mastered ones only as
      // filler if the pool runs short of a full session. Monster Hunt is the
      // same draw but for exactly the one grade being hunted.
      const pool = await this.prisma.eduQuestion.findMany({ where: { subject, grade: mode === 'HUNT' ? grade : { lte: grade }, active: true } });
      const progress = await this.prisma.eduQuestionProgress.findMany({ where: { userId, subject } });
      const byId = new Map(progress.map((p) => [p.questionId, p]));
      const eligible = pool.filter((q) => !excluded.has(q.id));
      const open = this.pickWeightedBuckets(
        [
          { items: shuffle(eligible.filter((q) => byId.get(q.id)?.correct === false)), weight: LearningService.WEIGHT_WRONG },
          { items: shuffle(eligible.filter((q) => !byId.has(q.id))), weight: LearningService.WEIGHT_NEW },
        ],
        count,
      );
      if (open.length >= count) return open;
      // Fewer unseen/wrong left than a full block: pad with already-mastered
      // ones so the session still has its 5 - they're only filler.
      const taken = new Set(open.map((q) => q.id));
      const filler = shuffle(eligible.filter((q) => byId.get(q.id)?.correct === true && !taken.has(q.id))).slice(0, count - open.length);
      return [...open, ...filler];
    }

    const all = await this.prisma.eduQuestion.findMany({ where: { subject, grade: { lte: grade }, active: true } });
    const atGrade = all.filter((q) => q.grade === grade);
    if (!atGrade.length) throw new BadRequestException(`No ${subject} questions yet for grade ${grade}`);
    const progress = await this.prisma.eduQuestionProgress.findMany({ where: { userId, subject, grade: { lte: grade } } });
    const progressById = new Map(progress.map((p) => [p.questionId, p]));
    const eligible = atGrade.filter((q) => !excluded.has(q.id));
    const stillWrong = shuffle(eligible.filter((q) => progressById.get(q.id)?.correct === false));
    const neverTried = shuffle(eligible.filter((q) => !progressById.has(q.id)));
    const mastered = shuffle(eligible.filter((q) => progressById.get(q.id)?.correct === true));
    const catchUp = shuffle(
      all.filter((q) => q.grade < grade && !excluded.has(q.id) && progressById.get(q.id)?.correct !== true),
    );

    const picked = this.pickWeightedBuckets(
      [
        { items: stillWrong, weight: LearningService.WEIGHT_WRONG },
        { items: neverTried, weight: LearningService.WEIGHT_NEW },
        { items: catchUp, weight: LearningService.WEIGHT_CATCHUP, max: LearningService.CATCHUP_MAX_PER_BLOCK },
        { items: mastered, weight: LearningService.WEIGHT_MASTERED },
      ],
      count,
    );
    if (picked.length >= count) return picked;
    // A grade with fewer questions than a block (a brand-new or tiny bank):
    // pad from anywhere in the subject so the block still reaches its full
    // size instead of stalling a session on a blank screen.
    const taken = new Set([...picked.map((q) => q.id), ...excludeIds]);
    const spare = await this.prisma.eduQuestion.findMany({ where: { subject, active: true, id: { notIn: [...taken] } }, take: 60 });
    return [...picked, ...shuffle(spare).slice(0, count - picked.length)];
  }

  // Answer is deliberately withheld from what's sent to the client - a kid
  // reading the network tab shouldn't be able to see it before answering.
  private presentQuestion(q: { id: string; type: string; prompt: string; choicesJson: unknown; visualJson: unknown; mediaJson?: unknown; answer?: string }) {
    return { id: q.id, type: q.type, prompt: q.prompt, choices: q.choicesJson ?? null, visual: q.visualJson ?? null, media: this.safeMedia(q) };
  }

  // The media alt text (read aloud, and shown if the image fails to load) must
  // not contain the answer ("A photo of a lion" under "Which animal is this?").
  // It's replaced with a generic line whenever it mentions the answer or any
  // of the choices; descriptions that don't leak pass through untouched.
  private safeMedia(q: { mediaJson?: unknown; answer?: string; choicesJson?: unknown }) {
    const m = q.mediaJson as { alt?: string } | null | undefined;
    if (!m || typeof m !== 'object') return null;
    if (!m.alt) return m;
    const alt = m.alt.toLowerCase();
    const needles = [q.answer, ...(Array.isArray(q.choicesJson) ? (q.choicesJson as string[]) : [])]
      .map((x) => (x ?? '').toLowerCase().trim())
      .filter((x) => x.length >= 3);
    return needles.some((n) => alt.includes(n)) ? { ...m, alt: 'A picture for this question' } : m;
  }

  // Right if it matches the main answer or any accepted alternate, trimmed
  // and case-insensitive (typed answers also ignore a trailing period).
  private isCorrect(given: string, q: { answer: string; acceptedJson?: unknown; type?: string }): boolean {
    // Typed answers also forgive a trailing period/exclamation and doubled
    // spaces; a multiple-choice answer must match its choice exactly.
    const typed = q.type === 'TEXT_INPUT';
    const clean = (s: string) => {
      const t = this.normalize(s).normalize('NFKC').replace(/\s+/g, ' ').replace(/[\u2018\u2019]/g, "'");
      return typed ? t.replace(/[.!]+$/, '') : t;
    };
    const g = clean(given);
    if (g === clean(q.answer)) return true;
    // Typed numbers: "19", "19.0", "$19.00" and "1,000" all match the same value.
    if (typed) {
      const num = (t: string) => {
        const v = t.replace(/^\$\s*/, '').replace(/\s/g, '');
        const plain = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(v) ? v.replace(/,/g, '') : v; // commas only as thousands separators
        return /^-?\d+(\.\d+)?$/.test(plain) ? Number(plain) : null;
      };
      const a = num(g);
      const b = num(clean(q.answer));
      if (a !== null && b !== null && Math.abs(a - b) < 1e-9) return true;
    }
    const alts = Array.isArray(q.acceptedJson) ? (q.acceptedJson as unknown[]) : [];
    return alts.some((a) => typeof a === 'string' && clean(a) === g);
  }

  // Mastered = latest attempt right, counting only questions still active -
  // a deactivated duplicate must not inflate (or block) anyone's progress.
  private masteredCount(userId: string, subject: string, grade: number) {
    return this.prisma.eduQuestionProgress.count({ where: { userId, subject, grade, correct: true, question: { active: true } } });
  }

  // Casey's own instruction, 2026-09: answering every active question in
  // the current grade's bank correctly auto-promotes to the next grade -
  // an earned bump, distinct from (and layered on top of) the birthday-
  // seeded default (see UserSubjectGrade's own comment on why that's not a
  // contradiction). Checked against `grade` as SNAPSHOT ON THE SESSION, not
  // whatever UserSubjectGrade says right now - same "don't retroactively
  // change what a session already asked" rule the grade snapshot exists for.
  //
  // No hardcoded grade ceiling here (used to stop dead at grade >= 6) -
  // the real ceiling is just "does the next grade actually have any
  // questions yet", so this keeps working unchanged whenever an owner adds
  // higher-grade content, without a code change. Mastered-but-nothing-to-
  // promote-into is exactly the "maxed out for now" lock (see startSession).
  private async maybePromote(userId: string, subject: string, grade: number): Promise<number | null> {
    const totalActive = await this.prisma.eduQuestion.count({ where: { subject, grade, active: true } });
    if (totalActive === 0) return null;
    const masteredCount = await this.masteredCount(userId, subject, grade);
    if (masteredCount < promoteTarget(totalActive)) return null;
    const newGrade = grade + 1;
    const nextGradeHasContent = await this.prisma.eduQuestion.count({ where: { subject, grade: newGrade, active: true } });
    if (nextGradeHasContent === 0) return null;
    // Never move a kid DOWN (a Monster Hunt masters a lower grade, which must
    // not drag their current grade back to it).
    const current = await this.prisma.userSubjectGrade.findUnique({ where: { userId_subject: { userId, subject } } });
    if (current && current.grade >= newGrade) return null;
    await this.prisma.userSubjectGrade.upsert({
      where: { userId_subject: { userId, subject } },
      create: { userId, subject, grade: newGrade, setById: userId },
      update: { grade: newGrade, setById: userId },
    });
    return newGrade;
  }

  // Mastered count that befriends a grade's monster: the promotion bar, or the
  // uncapped 90% on the top grade (same rule isMaxedOut uses).
  private async monsterTarget(subject: string, grade: number): Promise<number> {
    const total = await this.prisma.eduQuestion.count({ where: { subject, grade, active: true } });
    if (total === 0) return 0;
    const nextHasContent = await this.prisma.eduQuestion.count({ where: { subject, grade: grade + 1, active: true } });
    return nextHasContent > 0 ? promoteTarget(total) : topOfLadderTarget(total);
  }

  // Befriend every grade this kid has now mastered to its bar and doesn't have
  // yet. `onlyGrades` limits the check to grades a session just touched;
  // omitted, it checks the whole ladder (self-heals kids who crossed the bar
  // before monsters were sticky). Returns the grades newly befriended.
  // `pay` (set by answer(), never by the self-heal path) also pays the
  // one-time unlock bonus in the same transaction that creates the friend
  // row, so a monster can only ever pay once.
  private async syncMonsterFriends(
    userId: string,
    subject: string,
    onlyGrades?: number[],
    pay?: { tokensPerCorrect: number; tokensDisabled: boolean },
  ): Promise<{ grades: number[]; bonus: Record<number, number> }> {
    const grades = onlyGrades ?? [0, 1, 2, 3, 4, 5, 6];
    const have = await this.prisma.eduMonsterFriend.findMany({ where: { userId, subject, grade: { in: grades } }, select: { grade: true } });
    const haveSet = new Set(have.map((h) => h.grade));
    const fresh: number[] = [];
    const bonus: Record<number, number> = {};
    for (const grade of grades) {
      if (haveSet.has(grade)) continue;
      const target = await this.monsterTarget(subject, grade);
      if (target <= 0) continue;
      if ((await this.masteredCount(userId, subject, grade)) < target) continue;
      // skipDuplicates + the count: two simultaneous finishes can't both claim it.
      const amount = pay && !pay.tokensDisabled ? monsterUnlockBonus(pay.tokensPerCorrect, grade) : 0;
      const won = await this.prisma.$transaction(async (tx) => {
        const made = await tx.eduMonsterFriend.createMany({ data: [{ userId, subject, grade }], skipDuplicates: true });
        if (made.count !== 1) return false;
        if (amount > 0) {
          await tx.tokenLedger.create({
            data: {
              userId,
              delta: amount,
              reason: `Learning games: ${subject} - monster unlocked (${GRADE_NAMES[grade] ?? `grade ${grade}`})`,
              type: 'EDU_GAME',
              refId: `monster:${subject}:${grade}`,
              createdById: userId,
            },
          });
        }
        return true;
      });
      if (won) {
        fresh.push(grade);
        if (amount > 0) bonus[grade] = amount;
      }
    }
    return { grades: fresh, bonus };
  }

  private async owned(userId: string, id: string) {
    const s = await this.prisma.eduSession.findFirst({ where: { id, userId } });
    if (!s) throw new NotFoundException('Session not found');
    return s;
  }

  async startSession(familyId: string, userId: string, subject: string, huntGrade?: number | null) {
    await assertFeatureEnabled(this.prisma, familyId, 'learningGames');
    const subj = this.sanitizeSubject(subject);

    // Resume whatever's already in flight for this subject instead of
    // dealing a fresh hand - see presentedJson's own comment for why this
    // exists (closing the quit-and-reroll-for-an-easy-question exploit).
    // Only resumes a session started TODAY though - an abandoned session
    // left open overnight (kid walked away mid-block) used to get resumed
    // forever, dragging its stale `practiceOnly` flag (decided against
    // yesterday's rewardedSessionsToday count) into today and showing "hit
    // today's limit" on a kid who hadn't done anything today at all. A
    // session that's aged past midnight gets closed out below instead, same
    // as the "nothing left to resume" cleanup right after this block.
    const dayStart = startOfDayInZone(todayKeyInZone(DEFAULT_TIMEZONE), DEFAULT_TIMEZONE);
    // Hunts and normal play are separate lanes: a half-finished hunt must
    // never be handed back to a kid who tapped a different hunt (or the
    // regular Start), and an open regular block must not hijack a hunt tap.
    // Only a session in the SAME lane (same hunt grade, or any non-hunt)
    // resumes; any other open hunt for this subject is closed out here, so
    // backing out of a hunt never leaves it stuck.
    const wantHunt = huntGrade !== undefined && huntGrade !== null;
    const laneWhere = wantHunt ? { mode: 'HUNT', grade: huntGrade as number } : { mode: { not: 'HUNT' } };
    await this.prisma.eduSession.updateMany({
      where: {
        userId,
        subject: subj,
        mode: 'HUNT',
        status: { in: ['BLOCK_A', 'BREAK', 'BLOCK_B'] },
        ...(wantHunt ? { grade: { not: huntGrade as number } } : {}),
      },
      data: { status: 'ABANDONED', finishedAt: new Date() },
    });
    const inFlight = await this.prisma.eduSession.findFirst({
      where: { userId, subject: subj, status: { in: ['BLOCK_A', 'BREAK', 'BLOCK_B'] }, startedAt: { gte: dayStart }, ...laneWhere },
      orderBy: { startedAt: 'desc' },
    });
    const stale = await this.prisma.eduSession.findMany({
      where: { userId, subject: subj, status: { in: ['BLOCK_A', 'BREAK', 'BLOCK_B'] }, startedAt: { lt: dayStart } },
      select: { id: true },
    });
    if (stale.length) {
      await this.prisma.eduSession.updateMany({ where: { id: { in: stale.map((s) => s.id) } }, data: { status: 'ABANDONED', finishedAt: new Date() } });
    }
    if (inFlight) {
      const resumed = await this.resumeSession(inFlight);
      if (resumed.phase === 'BREAK' || resumed.questions.length > 0) return resumed;
      // Nothing left to actually resume into (a malformed or pre-migration
      // row with no presentedJson) - close it out rather than hand back a
      // broken empty-questions payload, then fall through to a fresh start.
      await this.prisma.eduSession.update({ where: { id: inFlight.id }, data: { status: 'ABANDONED', finishedAt: new Date() } });
    }

    let grade = await this.myGrade(userId, familyId, subj);
    // Catch-up: normally a maxed-out grade only gets re-checked for
    // promotion at the END of a session (maybePromote, called from
    // answer()) - but a kid who's ALREADY maxed out can't start a new
    // session at all once locked below, so nothing would ever re-run that
    // check again even after an owner adds the next grade's questions.
    // Run it here too, before deciding whether to lock.
    const bumped = await this.maybePromote(userId, subj, grade);
    if (bumped !== null) grade = bumped;
    // A grade with no content yet (a subject that only reaches grade 4, or a
    // birthday-derived default above it) falls back to the nearest grade that
    // has some, instead of erroring out on a kid.
    grade = await this.effectiveGrade(subj, grade);
    // Top of the ladder (90% mastered, nothing higher to promote into): not a
    // dead end anymore - "Explore & Review" opens whatever the kid has never
    // seen or still has wrong at or below this grade (new content added to a
    // grade they already passed lands here), at half pay. Only when even that
    // pool is empty is the subject truly done for now.
    let mode = 'NORMAL';
    // Monster Hunt: replay one grade BELOW the kid's current one to collect
    // its monster. The session runs at that lower grade; `huntFrom` (their
    // real grade then) is what sets how little it pays.
    let huntFrom: number | undefined;
    if (huntGrade !== undefined && huntGrade !== null) {
      if (!Number.isInteger(huntGrade) || huntGrade < 0 || huntGrade >= grade) {
        throw new BadRequestException('You can only hunt monsters from grades below the one you are in now.');
      }
      const inGrade = await this.prisma.eduQuestion.count({ where: { subject: subj, grade: huntGrade, active: true } });
      if (inGrade === 0) throw new BadRequestException('No questions at that grade yet.');
      if ((await this.masteredCount(userId, subj, huntGrade)) >= inGrade) {
        throw new BadRequestException("You've already mastered every question at that grade!");
      }
      huntFrom = grade;
      grade = huntGrade;
      mode = 'HUNT';
    } else if (await this.isMaxedOut(subj, grade, userId)) {
      if ((await this.reviewPoolCount(userId, subj, grade)) < 1) {
        throw new BadRequestException(`You've mastered every ${subj.toLowerCase()} question so far - more is coming once a higher grade is added!`);
      }
      mode = 'REVIEW';
    }
    const questions = await this.pickQuestions(subj, grade, userId, [], BLOCK_SIZE, mode);
    // Decided upfront, before a single question is shown - see
    // EduSession.practiceOnly's own comment for why this can't wait until
    // the end. dailySessionCap null (default) = no cap, every session
    // stays rewarded exactly like before this feature existed.
    const settings = await this.ensureSettings(familyId, userId);
    // Hunts neither use up nor are stopped by the daily rewarded-session cap
    // (they pay next to nothing; the cap exists to limit real earnings).
    const practiceOnly = mode !== 'HUNT' && settings.dailySessionCap != null && (await this.rewardedSessionsToday(userId, subj)) >= settings.dailySessionCap;
    const session = await this.prisma.eduSession.create({
      data: {
        userId,
        subject: subj,
        grade,
        status: 'BLOCK_A',
        practiceOnly,
        mode,
        presentedJson: { blockA: questions.map((q) => q.id), ...(huntFrom !== undefined ? { huntFrom } : {}) } as unknown as Prisma.InputJsonValue,
      },
    });
    // Two start taps landing together would each create a session; keep only
    // the earliest one for this subject and hand that back to both.
    const live = await this.prisma.eduSession.findMany({
      where: { userId, subject: subj, status: { in: ['BLOCK_A', 'BREAK', 'BLOCK_B'] }, startedAt: { gte: dayStart }, ...laneWhere },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    });
    if (live.length > 1 && live[0].id !== session.id) {
      await this.prisma.eduSession.update({ where: { id: session.id }, data: { status: 'ABANDONED', finishedAt: new Date() } });
      return this.resumeSession(live[0]);
    }
    return {
      sessionId: session.id,
      subject: subj,
      grade,
      phase: 'BLOCK_A',
      questions: questions.map((q) => this.presentQuestion(q)),
      tokensAwarded: 0,
      practiceOnly,
      mode,
      monsterKnown: await this.monsterKnown(userId, subj, grade),
      payPct: huntFrom !== undefined ? Math.round(huntPayFraction(huntFrom - grade) * 100) : undefined,
    };
  }

  // Has this kid already befriended this grade's monster? Until they have, the
  // client keeps its name and look a mystery.
  private async monsterKnown(userId: string, subject: string, grade: number): Promise<boolean> {
    return !!(await this.prisma.eduMonsterFriend.findUnique({ where: { userId_subject_grade: { userId, subject, grade } }, select: { grade: true } }));
  }

  private async effectiveGrade(subject: string, grade: number): Promise<number> {
    if ((await this.prisma.eduQuestion.count({ where: { subject, grade, active: true } })) > 0) return grade;
    const below = await this.prisma.eduQuestion.findFirst({ where: { subject, grade: { lt: grade }, active: true }, orderBy: { grade: 'desc' }, select: { grade: true } });
    if (below) return below.grade;
    const above = await this.prisma.eduQuestion.findFirst({ where: { subject, grade: { gt: grade }, active: true }, orderBy: { grade: 'asc' }, select: { grade: true } });
    return above ? above.grade : grade;
  }

  // Questions at or below `grade` this kid hasn't gotten right yet (unseen or
  // still wrong) - the pool Explore & Review draws from.
  private async reviewPoolCount(userId: string, subject: string, grade: number): Promise<number> {
    const pool = await this.prisma.eduQuestion.findMany({ where: { subject, grade: { lte: grade }, active: true }, select: { id: true } });
    if (!pool.length) return 0;
    const done = await this.prisma.eduQuestionProgress.count({
      where: { userId, subject, correct: true, questionId: { in: pool.map((p) => p.id) } },
    });
    return pool.length - done;
  }

  // Rebuilds exactly what a resumed session should hand the client: the
  // SAME block that was already drawn (presentedJson), minus whatever's
  // already been answered this block (roundsJson) - so re-opening lands on
  // the exact next unanswered question, not a re-roll and not a restart of
  // the whole block from question 1.
  private async resumeSession(session: {
    id: string;
    subject: string;
    grade: number;
    status: string;
    roundsJson: unknown;
    presentedJson: unknown;
    tokensAwarded: number;
    practiceOnly: boolean;
    mode: string;
    userId: string;
  }) {
    const presented = (session.presentedJson as { blockA?: string[]; blockB?: string[]; huntFrom?: number }) ?? {};
    const rounds = (session.roundsJson as unknown as EduRound[]) ?? [];
    const answeredIds = new Set(rounds.filter((r) => r.block === session.status).map((r) => r.questionId));
    const ids = session.status === 'BLOCK_A' ? (presented.blockA ?? []) : session.status === 'BLOCK_B' ? (presented.blockB ?? []) : [];
    const remainingIds = ids.filter((id) => !answeredIds.has(id));
    const rows = remainingIds.length ? await this.prisma.eduQuestion.findMany({ where: { id: { in: remainingIds } } }) : [];
    const byId = new Map(rows.map((q) => [q.id, q]));
    // findMany doesn't preserve `id: { in: [...] }` order - put it back in
    // the order the block was actually presented in.
    const ordered = remainingIds.map((id) => byId.get(id)).filter((q): q is (typeof rows)[number] => !!q);
    return {
      sessionId: session.id,
      subject: session.subject,
      grade: session.grade,
      phase: session.status as 'BLOCK_A' | 'BREAK' | 'BLOCK_B',
      questions: ordered.map((q) => this.presentQuestion(q)),
      tokensAwarded: session.tokensAwarded,
      practiceOnly: session.practiceOnly,
      mode: session.mode,
      monsterKnown: await this.monsterKnown(session.userId, session.subject, session.grade),
      payPct: session.mode === 'HUNT' && typeof presented.huntFrom === 'number' ? Math.round(huntPayFraction(presented.huntFrom - session.grade) * 100) : undefined,
      correctSoFar: rounds.filter((r) => r.correct).length,
    };
  }

  // Every active question at this grade mastered, AND nothing at the next
  // grade to promote into - the actual "nothing left to play" state.
  // Shared by startSession (refuses a new session) and getProgress (tells
  // the client to show a locked badge instead of a Play button).
  private async isMaxedOut(subject: string, grade: number, userId: string): Promise<boolean> {
    const totalActive = await this.prisma.eduQuestion.count({ where: { subject, grade, active: true } });
    if (totalActive === 0) return false; // no content at all reads as "not ready yet", not "locked"
    const nextGradeHasContent = await this.prisma.eduQuestion.count({ where: { subject, grade: grade + 1, active: true } });
    if (nextGradeHasContent > 0) return false; // promotion (not a lock) is what happens next
    const masteredCount = await this.masteredCount(userId, subject, grade);
    return masteredCount >= topOfLadderTarget(totalActive);
  }

  private normalize(s: string): string {
    return (s ?? '').trim().toLowerCase();
  }

  async answer(familyId: string, userId: string, sessionId: string, questionId: string, given: string) {
    await assertFeatureEnabled(this.prisma, familyId, 'learningGames');
    if (typeof questionId !== 'string' || typeof given !== 'string') throw new BadRequestException('Bad answer');
    const session = await this.owned(userId, sessionId);
    if (session.status !== 'BLOCK_A' && session.status !== 'BLOCK_B') {
      throw new BadRequestException('Session is not accepting answers right now');
    }
    const block = session.status as 'BLOCK_A' | 'BLOCK_B';
    const rounds = ((session.roundsJson as unknown as EduRound[]) ?? []).slice();
    // Only a question that was actually dealt for THIS block, and not yet
    // answered in it, can be answered - otherwise one known question id could
    // be re-sent ten times to fill a whole paid session.
    const presented = (session.presentedJson as { blockA?: string[]; blockB?: string[] }) ?? {};
    const dealt = (block === 'BLOCK_A' ? presented.blockA : presented.blockB) ?? [];
    const answeredHere = new Set(rounds.filter((r) => r.block === block).map((r) => r.questionId));
    if (!dealt.includes(questionId) || answeredHere.has(questionId)) {
      throw new BadRequestException("That question isn't up right now - reload to pick up where you left off.");
    }
    const question = await this.prisma.eduQuestion.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException('Question not found');
    const correct = this.isCorrect(given, question);
    // "fresh" = this answer newly turns the question right (it wasn't already
    // mastered) - what Explore & Review actually pays for.
    const prior = await this.prisma.eduQuestionProgress.findUnique({ where: { userId_questionId: { userId, questionId } } });
    const fresh = correct && !prior?.correct;

    rounds.push({ block, questionId, given, correct, fresh });

    // Durable per-question outcome - powers next time's question selection
    // (resurface if still wrong) and grade auto-promotion. Recorded on every
    // answer regardless of whether the session itself ever gets finished,
    // under the QUESTION's own grade (a catch-up question from a lower grade
    // counts toward that grade, not the one the session is running at).
    const progressUpsert = (tx: Prisma.TransactionClient) =>
      tx.eduQuestionProgress.upsert({
        where: { userId_questionId: { userId, questionId } },
        create: { userId, questionId, subject: question.subject, grade: question.grade, correct },
        update: { correct, attempts: { increment: 1 } },
      });

    const settings = await this.ensureSettings(familyId, userId);
    const buyer = await this.prisma.user.findUnique({ where: { id: userId }, select: { tokensDisabled: true } });
    const review = session.mode === 'REVIEW';
    const hunt = session.mode === 'HUNT';
    // Explore & Review and Monster Hunt both pay only at the end, on newly
    // mastered questions, at a reduced rate, with no perfect-session bonus.
    const reduced = review || hunt;
    const huntFrom = (session.presentedJson as { huntFrom?: number } | null)?.huntFrom;
    const reducedFraction = review ? REVIEW_PAY_FRACTION : huntPayFraction(typeof huntFrom === 'number' ? huntFrom - session.grade : 3);
    // This question's own share, for the live "N so far" counter - NOT
    // written to the ledger here. Real payout happens once, at DONE, below
    // (Casey's own instruction: finishing is what makes it real).
    // practiceOnly forces this to 0 regardless of correctness - decided at
    // startSession, told to the kid before the first question, never a
    // surprise sprung here. Explore & Review pays only at the end (half rate
    // on NEWLY mastered questions, floored over the whole session).
    const tokensAwarded = !reduced && correct && !buyer?.tokensDisabled && !session.practiceOnly ? settings.tokensPerCorrect : 0;
    const blockCount = rounds.filter((r) => r.block === block).length;

    const conflict = () => new ConflictException('That answer was already received - give it a second and reload.');

    // Block B just completed - finalize the session: roll the all-correct
    // bonus, write the ONE real ledger entry for everything earned this
    // session, check for grade auto-promotion.
    if (blockCount >= BLOCK_SIZE && block === 'BLOCK_B') {
      const allCorrect = rounds.every((r) => r.correct);
      const correctCount = rounds.filter((r) => r.correct).length;
      const freshCorrect = rounds.filter((r) => r.fresh).length;
      const canPay = !buyer?.tokensDisabled && !session.practiceOnly;
      const totalQuestionTokens = reduced
        ? canPay
          ? Math.floor(freshCorrect * settings.tokensPerCorrect * reducedFraction)
          : 0
        : session.tokensAwarded + tokensAwarded;
      let bonusTokens = 0;
      let bonusPrizeId: string | null = null;
      const bonusPool = settings.bonusPoolJson as unknown as PoolEntry[];
      // practiceOnly skips the bonus roll entirely, not just the token
      // amount - rolling it anyway would let a "no payout today" session
      // still win a real prize off the pool, which is exactly the loophole
      // this whole feature exists to close. Review sessions never roll it.
      if (allCorrect && !session.practiceOnly && !reduced) {
        const result = this.draw(bonusPool);
        if (result.kind === 'PRIZE') bonusPrizeId = result.prizeId;
        else if (!buyer?.tokensDisabled) bonusTokens = result.amount;
      }
      const ledgerTotal = totalQuestionTokens + bonusTokens;

      // Redemption Round: a rewarded session with EXACTLY one wrong answer
      // gets a one-question second chance at the perfect-session bonus. It
      // can only add (never take back anything already earned), and pays no
      // more than a genuinely perfect session would, so missing one on
      // purpose to unlock it is never worth it. See startRedemption.
      const redemptionOffer = !reduced && !session.practiceOnly && !buyer?.tokensDisabled && rounds.length - correctCount === 1;

      // One transaction: claim the answer (compare-and-swap on `rev`, so two
      // simultaneous submits can't both finish/pay the session), record it,
      // pay it. Any failure rolls the whole thing back.
      const done = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.eduSession.updateMany({
          where: { id: session.id, rev: session.rev, status: 'BLOCK_B' },
          data: {
            status: 'DONE',
            roundsJson: rounds as unknown as Prisma.InputJsonValue,
            tokensAwarded: totalQuestionTokens + bonusTokens,
            allCorrect,
            bonusPoolJson: bonusPool as unknown as Prisma.InputJsonValue,
            bonusWonPrizeId: bonusPrizeId,
            redemptionJson: redemptionOffer ? ({ state: 'OFFERED' } as Prisma.InputJsonValue) : undefined,
            finishedAt: new Date(),
            rev: { increment: 1 },
          },
        });
        if (claim.count !== 1) return false;
        await progressUpsert(tx);
        if (bonusPrizeId) await tx.redemption.create({ data: { prizeId: bonusPrizeId, userId, status: 'FULFILLED', source: 'GAME' } });
        if (ledgerTotal > 0) {
          await tx.tokenLedger.create({
            data: {
              userId,
              delta: ledgerTotal,
              reason: review
                ? `Learning games: ${session.subject} - Explore & Review (${correctCount}/${rounds.length} correct)`
                : hunt
                  ? `Learning games: ${session.subject} - Monster Hunt (${correctCount}/${rounds.length} correct)`
                  : `Learning games: ${session.subject} - session complete (${correctCount}/${rounds.length} correct)${bonusTokens > 0 ? ', perfect bonus' : ''}`,
              type: 'EDU_GAME',
              refId: session.id,
              createdById: userId,
            },
          });
        }
        return true;
      });
      if (!done) throw conflict();
      // A Monster Hunt replays a grade the kid already moved past - it never
      // promotes (and maybePromote refuses to move anyone down regardless).
      const promotedTo = hunt ? null : await this.maybePromote(userId, session.subject, session.grade);
      // Monsters: any grade this session newly mastered to the bar (a normal
      // session's catch-up questions can complete a lower grade too).
      const freshIds = rounds.filter((r) => r.fresh).map((r) => r.questionId);
      const touchedGrades = freshIds.length
        ? [...new Set((await this.prisma.eduQuestion.findMany({ where: { id: { in: freshIds } }, select: { grade: true } })).map((q) => q.grade))]
        : [];
      const unlocked = touchedGrades.length
        ? await this.syncMonsterFriends(userId, session.subject, touchedGrades, { tokensPerCorrect: settings.tokensPerCorrect, tokensDisabled: !!buyer?.tokensDisabled })
        : { grades: [] as number[], bonus: {} as Record<number, number> };
      const befriendedGrades = unlocked.grades;
      const befriended = befriendedGrades.includes(session.grade);
      const alreadyFriend = !befriended && !!(await this.prisma.eduMonsterFriend.findUnique({ where: { userId_subject_grade: { userId, subject: session.subject, grade: session.grade } } }));
      const monsterTarget = await this.monsterTarget(session.subject, session.grade);
      const monsterMastered = await this.masteredCount(userId, session.subject, session.grade);
      this.displayEvents.publish(familyId, { type: 'tokens' });
      // tokensAwarded here is THIS question's own delta, same contract as
      // every other answer() call - the client accumulates it locally into
      // its own running total, which by now already equals
      // totalQuestionTokens without the server needing to re-send it. (For
      // Explore & Review every earlier delta was 0, so the final one carries
      // the whole payout.) bonusTokens is separate and additive.
      return {
        correct,
        correctAnswer: question.answer,
        tokensAwarded: reduced ? totalQuestionTokens : tokensAwarded,
        phase: 'DONE',
        allCorrect,
        bonusTokens,
        bonusPrizeId,
        promotedTo,
        practiceOnly: session.practiceOnly,
        mode: session.mode,
        correctCount,
        befriended,
        befriendedGrades,
        // One-time unlock bonus per newly befriended grade (already in the ledger).
        monsterBonus: unlocked.bonus,
        alreadyFriend,
        monsterMastered,
        monsterTarget,
        redemptionOffer,
      };
    }

    // Block A just completed - hand off to the arcade break; block B's
    // questions are drawn fresh by advance(), not here.
    const newStatus = blockCount >= BLOCK_SIZE && block === 'BLOCK_A' ? 'BREAK' : block;
    const ok = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.eduSession.updateMany({
        where: { id: session.id, rev: session.rev, status: block },
        data: { status: newStatus, roundsJson: rounds as unknown as Prisma.InputJsonValue, tokensAwarded: { increment: tokensAwarded }, rev: { increment: 1 } },
      });
      if (claim.count !== 1) return false;
      await progressUpsert(tx);
      return true;
    });
    if (!ok) throw conflict();
    this.displayEvents.publish(familyId, { type: 'tokens' });
    return { correct, correctAnswer: question.answer, tokensAwarded, phase: newStatus };
  }

  // ---------------- Redemption Round ----------------

  // The bonus offer lapses after this long - not something to bank for later.
  private static readonly REDEMPTION_WINDOW_MS = 30 * 60 * 1000;

  private async ownedRedemption(userId: string, sessionId: string, expect: string[]) {
    const session = await this.owned(userId, sessionId);
    const r = (session.redemptionJson as { state?: string; questionId?: string } | null) ?? null;
    if (session.status !== 'DONE' || !r || !r.state || !expect.includes(r.state)) {
      throw new BadRequestException(expect.includes('OFFERED') ? 'No bonus question is waiting for this session.' : 'Start the bonus question first.');
    }
    return { session, r };
  }

  // Accept or decline the offer. Accepting returns ONE question a little
  // harder than the session: an unmastered one from the next grade up when
  // that grade has content (research on difficulty adaptation: a small step
  // up keeps interest, a big jump lowers it), else a still-wrong/unseen one
  // from the session's own grade. Idempotent: asking again after accepting
  // hands back the SAME question (a lost response or reload can't strand it),
  // and declining (even after accepting) just forfeits it.
  async startRedemption(familyId: string, userId: string, sessionId: string, accept: boolean) {
    await assertFeatureEnabled(this.prisma, familyId, 'learningGames');
    const { session, r } = await this.ownedRedemption(userId, sessionId, ['OFFERED', 'ACCEPTED']);
    const stale = !session.finishedAt || Date.now() - session.finishedAt.getTime() > LearningService.REDEMPTION_WINDOW_MS;
    const setState = (state: string, questionId?: string) =>
      this.prisma.eduSession.updateMany({
        where: { id: session.id, rev: session.rev },
        data: { redemptionJson: (questionId ? { state, questionId } : { state }) as Prisma.InputJsonValue, rev: { increment: 1 } },
      });
    if (!accept || stale) {
      await setState('DECLINED');
      if (accept && stale) throw new BadRequestException('That bonus question expired - they only last a little while.');
      return { ok: true };
    }
    if (r.state === 'ACCEPTED' && r.questionId) {
      const again = await this.prisma.eduQuestion.findUnique({ where: { id: r.questionId } });
      if (again) return { ok: true, question: this.presentQuestion(again) };
    }
    const used = new Set(((session.roundsJson as unknown as EduRound[]) ?? []).map((x) => x.questionId));
    const mastered = new Set(
      (await this.prisma.eduQuestionProgress.findMany({ where: { userId, subject: session.subject, correct: true }, select: { questionId: true } })).map((p) => p.questionId),
    );
    const pick = async (grade: number) => {
      const pool = await this.prisma.eduQuestion.findMany({ where: { subject: session.subject, grade, active: true } });
      const open = pool.filter((q) => !used.has(q.id) && !mastered.has(q.id));
      return open.length ? open[Math.floor(Math.random() * open.length)] : null;
    };
    const q = (await pick(session.grade + 1)) ?? (await pick(session.grade));
    if (!q) {
      await setState('DECLINED');
      throw new BadRequestException('No bonus question is available right now.');
    }
    // Two simultaneous accepts: only the one that wins the swap hands out a question.
    const claim = await setState('ACCEPTED', q.id);
    if (claim.count !== 1) throw new ConflictException('Already started - reload to continue.');
    return { ok: true, question: this.presentQuestion(q) };
  }

  async answerRedemption(familyId: string, userId: string, sessionId: string, given: string) {
    await assertFeatureEnabled(this.prisma, familyId, 'learningGames');
    if (typeof given !== 'string') throw new BadRequestException('Bad answer');
    const { session, r } = await this.ownedRedemption(userId, sessionId, ['ACCEPTED']);
    const question = await this.prisma.eduQuestion.findUnique({ where: { id: r.questionId } });
    if (!question) throw new NotFoundException('Question not found');
    const correct = this.isCorrect(given, question);
    const settings = await this.ensureSettings(familyId, userId);
    // Exactly what a perfect session would have paid on top of what they
    // already got: the one missed question's share, plus the bonus roll.
    let tokens = 0;
    let bonusTokens = 0;
    let bonusPrizeId: string | null = null;
    if (correct) {
      tokens = settings.tokensPerCorrect;
      const result = this.draw(settings.bonusPoolJson as unknown as PoolEntry[]);
      if (result.kind === 'PRIZE') bonusPrizeId = result.prizeId;
      else bonusTokens = result.amount;
    }
    const total = tokens + bonusTokens;
    // One try, paid once: the compare-and-swap on `rev` means parallel copies
    // of the same (or a different) answer can't each collect.
    const done = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.eduSession.updateMany({
        where: { id: session.id, rev: session.rev },
        data: {
          redemptionJson: { state: correct ? 'WON' : 'LOST', questionId: question.id } as Prisma.InputJsonValue,
          tokensAwarded: { increment: total },
          allCorrect: correct ? true : undefined,
          bonusWonPrizeId: bonusPrizeId ?? undefined,
          rev: { increment: 1 },
        },
      });
      if (claim.count !== 1) return false;
      await tx.eduQuestionProgress.upsert({
        where: { userId_questionId: { userId, questionId: question.id } },
        create: { userId, questionId: question.id, subject: question.subject, grade: question.grade, correct },
        update: { correct, attempts: { increment: 1 } },
      });
      if (bonusPrizeId) await tx.redemption.create({ data: { prizeId: bonusPrizeId, userId, status: 'FULFILLED', source: 'GAME' } });
      if (total > 0) {
        await tx.tokenLedger.create({
          data: {
            userId,
            delta: total,
            reason: `Learning games: ${session.subject} - Redemption Round won${bonusTokens > 0 ? ', perfect bonus' : ''}`,
            type: 'EDU_GAME',
            refId: session.id,
            createdById: userId,
          },
        });
      }
      return true;
    });
    if (!done) throw new ConflictException('That answer was already received.');
    if (correct) this.displayEvents.publish(familyId, { type: 'tokens' });
    const promotedTo = await this.maybePromote(userId, session.subject, session.grade);
    return { correct, correctAnswer: question.answer, tokensAwarded: tokens, bonusTokens, bonusPrizeId, promotedTo };
  }

  // ---------------- Progress (adult-only) ----------------

  // Per-subject mastery snapshot + the actual list of questions this kid is
  // currently getting wrong (Casey's own request - "see each kid's
  // progress, wrong questions, answer stats" without having to eyeball a
  // live session, AND a kid should be able to see their own on the app or
  // the kiosk). `correct` on EduQuestionProgress is the LATEST attempt
  // only (see that model's own comment), so "wrong" here means "wrong
  // right now", not "ever missed once" - a question gotten right since
  // drops off this list on its own.
  async getProgress(familyId: string, actorId: string, targetUserId: string) {
    if (actorId !== targetUserId) await this.assertAdult(actorId);
    const target = await this.prisma.user.findFirst({ where: { id: targetUserId, familyId } });
    if (!target) throw new NotFoundException('Family member not found');

    const grades = await this.prisma.userSubjectGrade.findMany({ where: { userId: targetUserId } });
    const gradeBySubject = new Map(grades.map((g) => [g.subject, g.grade]));

    const subjects: Record<string, unknown> = {};
    for (const subject of SUBJECTS) {
      const grade = gradeBySubject.get(subject) ?? this.defaultGrade(target.birthday);
      const bankSize = await this.prisma.eduQuestion.count({ where: { subject, grade, active: true } });
      // Only questions still active: a deactivated duplicate's old answer
      // must not count toward (or against) anyone's progress.
      const progress = await this.prisma.eduQuestionProgress.findMany({
        where: { userId: targetUserId, subject, grade, question: { active: true } },
      });
      const wrong = progress.filter((p) => !p.correct);
      const mastered = progress.filter((p) => p.correct);
      const wrongQuestions = wrong.length
        ? await this.prisma.eduQuestion.findMany({
            where: { id: { in: wrong.map((w) => w.questionId) } },
            select: { id: true, type: true, prompt: true, choicesJson: true, answer: true, mediaJson: true },
          })
        : [];
      const wrongById = new Map(wrong.map((w) => [w.questionId, w]));
      const maxedOut = await this.isMaxedOut(subject, grade, targetUserId);
      const reviewAvailable = maxedOut ? await this.reviewPoolCount(targetUserId, subject, grade) : 0;
      subjects[subject] = {
        grade,
        bankSize,
        masteredCount: mastered.length,
        wrongCount: wrong.length,
        untriedCount: Math.max(0, bankSize - progress.length),
        // Mastered count needed to move up (promoteTarget) - the client
        // scales its progress bar to this so a full bar means "ready".
        promoteAt: bankSize > 0 ? ((await this.prisma.eduQuestion.count({ where: { subject, grade: grade + 1, active: true } })) > 0 ? promoteTarget(bankSize) : topOfLadderTarget(bankSize)) : 0,
        accuracyPct: progress.length ? Math.round((mastered.length / progress.length) * 100) : null,
        // Top of the ladder with nothing to explore either: the client greys
        // out Play and shows "mastered for now". A maxed-out kid who still
        // has unseen/wrong questions at or below this grade is NOT locked -
        // they get Explore & Review (reviewAvailable > 0).
        locked: maxedOut && reviewAvailable === 0,
        reviewAvailable,
        wrongQuestions: wrongQuestions.map((q) => ({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          choices: q.choicesJson ?? null,
          media: q.mediaJson ?? null,
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

    const currentGrades = new Map<string, number>();
    for (const s of SUBJECTS) currentGrades.set(s, gradeBySubject.get(s) ?? this.defaultGrade(target.birthday));
    return { userId: target.id, displayName: target.displayName, subjects, recentSessions, monsters: await this.getMonsters(targetUserId, currentGrades) };
  }

  // The Monster Den: one monster per (subject, grade), derived entirely from
  // data that already exists - no table. Befriended = at least one finished
  // regular session at that subject+grade with 8+ of 10 right; its form
  // (stage 1-3) follows how much of that grade's bank is mastered.
  private async getMonsters(userId: string, currentGrade: Map<string, number>) {
    const [bankRows, progress, friendRows] = await Promise.all([
      this.prisma.eduQuestion.groupBy({ by: ['subject', 'grade'], where: { active: true }, _count: { _all: true } }),
      this.prisma.eduQuestionProgress.findMany({
        where: { userId, correct: true, question: { active: true } },
        select: { subject: true, grade: true },
      }),
      this.prisma.eduMonsterFriend.findMany({ where: { userId }, select: { subject: true, grade: true } }),
    ]);
    const key = (s: string, g: number) => `${s}:${g}`;
    const bank = new Map(bankRows.map((r) => [key(r.subject, r.grade), r._count._all]));
    const masteredBy = new Map<string, number>();
    for (const p of progress) masteredBy.set(key(p.subject, p.grade), (masteredBy.get(key(p.subject, p.grade)) ?? 0) + 1);
    const friends = new Set(friendRows.map((f) => key(f.subject, f.grade)));
    // Same bar as monsterTarget, from the counts already in hand.
    const targetOf = (s: string, g: number) => {
      const total = bank.get(key(s, g)) ?? 0;
      return total === 0 ? 0 : (bank.get(key(s, g + 1)) ?? 0) > 0 ? promoteTarget(total) : topOfLadderTarget(total);
    };
    // Self-heal: anyone already past a grade's bar (e.g. before monsters were
    // sticky) gets that monster on first look, with no celebration.
    const missing: { userId: string; subject: string; grade: number }[] = [];
    for (const subject of SUBJECTS) {
      for (let grade = 0; grade <= 6; grade++) {
        const t = targetOf(subject, grade);
        if (t > 0 && !friends.has(key(subject, grade)) && (masteredBy.get(key(subject, grade)) ?? 0) >= t) {
          missing.push({ userId, subject, grade });
          friends.add(key(subject, grade));
        }
      }
    }
    if (missing.length) await this.prisma.eduMonsterFriend.createMany({ data: missing, skipDuplicates: true });
    const out: {
      subject: string;
      grade: number;
      befriended: boolean;
      masteredPct: number;
      mastered: number;
      target: number;
      // 'now' = the grade they're playing, 'below' = can hunt it, 'above' = not reached yet
      where: 'below' | 'now' | 'above';
      huntPayPct: number; // meaningful when where === 'below'
      huntable: boolean; // below their grade AND something left to master there
    }[] = [];
    for (const subject of SUBJECTS) {
      const current = currentGrade.get(subject) ?? 0;
      for (let grade = 0; grade <= 6; grade++) {
        const total = bank.get(key(subject, grade)) ?? 0;
        if (!total) continue;
        const mastered = masteredBy.get(key(subject, grade)) ?? 0;
        const where = grade < current ? 'below' : grade === current ? 'now' : 'above';
        out.push({
          subject,
          grade,
          befriended: friends.has(key(subject, grade)),
          masteredPct: Math.min(100, Math.round((mastered / total) * 100)),
          mastered,
          target: targetOf(subject, grade),
          where,
          huntPayPct: Math.round(huntPayFraction(current - grade) * 100),
          huntable: where === 'below' && mastered < total,
        });
      }
    }
    return out;
  }

  async advance(familyId: string, userId: string, sessionId: string) {
    await assertFeatureEnabled(this.prisma, familyId, 'learningGames');
    const session = await this.owned(userId, sessionId);
    // Already on block B (a resume after the break, not a fresh advance) -
    // hand back the SAME block instead of drawing a second one on top.
    if (session.status === 'BLOCK_B') {
      const resumed = await this.resumeSession(session);
      return { phase: 'BLOCK_B', questions: resumed.questions };
    }
    if (session.status !== 'BREAK') throw new BadRequestException('Not on a break right now');
    const rounds = (session.roundsJson as unknown as EduRound[]) ?? [];
    const usedIds = rounds.map((r) => r.questionId);
    const questions = await this.pickQuestions(session.subject, session.grade, userId, usedIds, BLOCK_SIZE, session.mode);
    const presented = (session.presentedJson as { blockA?: string[] }) ?? {};
    await this.prisma.eduSession.update({
      where: { id: session.id },
      data: {
        status: 'BLOCK_B',
        presentedJson: { ...presented, blockB: questions.map((q) => q.id) } as unknown as Prisma.InputJsonValue,
      },
    });
    return { phase: 'BLOCK_B', questions: questions.map((q) => this.presentQuestion(q)) };
  }

  // No longer called by the Quit button (confirmQuitModal in PlaySession) -
  // it used to, but that made quitting-and-restarting throw away the
  // in-flight block entirely, and a kid found the exploit hiding in that:
  // quit, restart, get a fresh random draw, repeat until the questions
  // shown happen to be ones already known. Quit now leaves the row alone
  // on purpose (see startSession's resume logic) so the SAME block is
  // waiting next time, not a new one. Kept as a real "close this out"
  // capability for whatever legitimately needs one later (an admin tool,
  // a genuine restart-with-new-questions action, etc) - just nothing
  // reachable from the kid-facing UI calls it right now.
  async abandonSession(familyId: string, userId: string, sessionId: string) {
    await assertFeatureEnabled(this.prisma, familyId, 'learningGames');
    const session = await this.owned(userId, sessionId);
    if (session.status === 'DONE' || session.status === 'ABANDONED') return { ok: true };
    await this.prisma.eduSession.update({ where: { id: session.id }, data: { status: 'ABANDONED', finishedAt: new Date() } });
    return { ok: true };
  }

  // ---------------- Question bank (owner-only - see assertOwner) ----------------

  private normalizeAnswer(s: string): string {
    return (s ?? '').trim().toLowerCase();
  }

  // Never trust the client's own idea of what's valid - same posture as
  // sanitizePool above. Mutates nothing; throws or returns a clean,
  // trimmed dto ready to write.
  private validateQuestionInput(input: EduQuestionInput): EduQuestionInput {
    const subject = this.sanitizeSubject(input.subject);
    if (!Number.isFinite(Number(input.grade))) throw new BadRequestException('Grade is required');
    const grade = Math.max(0, Math.min(6, Math.floor(Number(input.grade))));
    if (input.type !== 'MULTIPLE_CHOICE' && input.type !== 'TEXT_INPUT' && input.type !== 'IMAGE_CHOICE') throw new BadRequestException('Unknown question type');
    const prompt = (input.prompt ?? '').trim();
    if (!prompt) throw new BadRequestException('Prompt is required');
    const answer = (input.answer ?? '').trim();
    if (!answer) throw new BadRequestException('An answer is required');

    if (input.type === 'TEXT_INPUT') {
      if (EMOJI_RE.test(answer)) throw new BadRequestException('A written answer can’t contain emoji - a kid has to type it back exactly.');
      const acceptedAnswers = (input.acceptedAnswers ?? []).map((a) => (a ?? '').trim()).filter(Boolean);
      if (acceptedAnswers.some((a) => EMOJI_RE.test(a))) throw new BadRequestException('A written answer can’t contain emoji - a kid has to type it back exactly.');
      return { subject, grade, type: input.type, prompt, answer, acceptedAnswers, active: input.active };
    }

    // IMAGE_CHOICE: the choices ARE the letters on the pictures (A, B, ...),
    // one per picture, and the answer is one of those letters.
    if (input.type === 'IMAGE_CHOICE') {
      const n = (input.media as EduMediaInput | null | undefined)?.choiceImages?.length ?? 0;
      if (n < 2 || n > 4) throw new BadRequestException('A picture question needs 2 to 4 pictures');
      const letters = CHOICE_LETTERS.slice(0, n);
      const letter = answer.toUpperCase();
      if (!letters.includes(letter)) throw new BadRequestException('Pick which picture is the correct one');
      return { subject, grade, type: input.type, prompt, choices: letters, answer: letter, active: input.active };
    }

    // MULTIPLE_CHOICE
    const choices = (input.choices ?? []).map((c) => (c ?? '').trim()).filter(Boolean);
    const deduped = [...new Set(choices.map((c) => this.normalizeAnswer(c)))];
    if (choices.length < 2) throw new BadRequestException('Give at least 2 choices');
    if (deduped.length !== choices.length) throw new BadRequestException('Choices must all be different');
    if (!choices.some((c) => this.normalizeAnswer(c) === this.normalizeAnswer(answer))) {
      throw new BadRequestException('The correct answer has to be one of the choices');
    }
    return { subject, grade, type: input.type, prompt, choices, answer, active: input.active };
  }

  async listQuestions(
    actorId: string,
    filters: { subject?: string; grade?: number; type?: string; search?: string; activeOnly?: boolean },
    skip: number,
    take: number,
  ) {
    await this.assertOwner(actorId);
    const where: Prisma.EduQuestionWhereInput = {};
    if (filters.subject) where.subject = this.sanitizeSubject(filters.subject);
    if (filters.grade != null) where.grade = filters.grade;
    if (filters.type) where.type = filters.type;
    if (filters.activeOnly) where.active = true;
    // No `mode: 'insensitive'` - that's Postgres-only in Prisma, and this
    // app runs MySQL, whose default utf8mb4 collation is already
    // case-insensitive for a plain `contains`.
    if (filters.search?.trim()) where.prompt = { contains: filters.search.trim() };
    const rows = await this.prisma.eduQuestion.findMany({
      where,
      orderBy: [{ subject: 'asc' }, { grade: 'asc' }, { id: 'asc' }],
      skip,
      take: take + 1,
      include: { _count: { select: { progress: true } } },
    });
    const { items, hasMore } = paginate(rows, take);
    return {
      items: items.map((q) => ({
        id: q.id,
        subject: q.subject,
        grade: q.grade,
        type: q.type,
        prompt: q.prompt,
        active: q.active,
        isCustom: q.createdById != null,
        answeredByCount: q._count.progress,
        hasPhoto: !!(q.mediaJson as EduMediaInput | null)?.image || !!(q.mediaJson as EduMediaInput | null)?.choiceImages?.length,
        hasSound: !!(q.mediaJson as EduMediaInput | null)?.audio,
      })),
      hasMore,
    };
  }

  // "Needs attention": questions a kid has now missed 3+ times and STILL has
  // wrong. A well-formed question that gets this treatment is rare, so these
  // are the likeliest broken ones (wrong key, ambiguous wording) - the owner
  // can open each straight from the question bank.
  async questionHealth(actorId: string) {
    await this.assertOwner(actorId);
    const stuck = await this.prisma.eduQuestionProgress.groupBy({
      by: ['questionId'],
      where: { correct: false, attempts: { gte: 3 }, question: { active: true } },
      _count: { _all: true },
      _max: { attempts: true },
      orderBy: { _max: { attempts: 'desc' } },
      take: 30,
    });
    if (!stuck.length) return [];
    const qs = await this.prisma.eduQuestion.findMany({ where: { id: { in: stuck.map((x) => x.questionId) } } });
    const byId = new Map(qs.map((q) => [q.id, q]));
    return stuck
      .map((x) => {
        const q = byId.get(x.questionId);
        return q
          ? { id: q.id, subject: q.subject, grade: q.grade, type: q.type, prompt: q.prompt, answer: q.answer, kidsStuck: x._count._all, mostAttempts: x._max.attempts ?? 0 }
          : null;
      })
      .filter(Boolean);
  }

  async getQuestion(actorId: string, id: string) {
    await this.assertOwner(actorId);
    const q = await this.prisma.eduQuestion.findUnique({ where: { id }, include: { _count: { select: { progress: true } } } });
    if (!q) throw new NotFoundException('Question not found');
    return {
      id: q.id,
      subject: q.subject,
      grade: q.grade,
      type: q.type,
      prompt: q.prompt,
      choices: (q.choicesJson as string[] | null) ?? null,
      answer: q.answer,
      acceptedAnswers: (q.acceptedJson as string[] | null) ?? [],
      media: q.mediaJson ?? null,
      active: q.active,
      isCustom: q.createdById != null,
      answeredByCount: q._count.progress,
    };
  }

  // Checks every photo/sound path a question points at and returns the clean
  // media object to store (null = none) plus the uploaded-media ids it uses.
  // `keep` = paths the question already had, accepted as-is so editing the
  // prompt of an old question never trips over its existing files.
  private async cleanMedia(
    type: EduQuestionInput['type'],
    media: EduMediaInput | null | undefined,
    questionId: string | null,
    keep: Set<string>,
  ): Promise<{ clean: Record<string, unknown> | null; customIds: string[] }> {
    if (!media) {
      if (type === 'IMAGE_CHOICE') throw new BadRequestException('A picture question needs 2 to 4 pictures');
      return { clean: null, customIds: [] };
    }
    const customIds: string[] = [];
    const check = async (path: unknown, kind: 'IMAGE' | 'AUDIO'): Promise<string> => {
      if (typeof path !== 'string' || !path) throw new BadRequestException('Missing picture or sound');
      // Uploaded files are always looked up and collected (even ones the
      // question already had) so the orphan cleanup on update never deletes a
      // file that is still in use.
      const id = customMediaId(path);
      if (!id) {
        if (keep.has(path) || isStaticMediaPath(path, kind)) return path;
        throw new BadRequestException('That picture or sound is not one we can use - upload it again');
      }
      const row = await this.prisma.eduMedia.findUnique({ where: { id }, select: { kind: true, questionId: true } });
      if (!row || row.kind !== kind) throw new BadRequestException('That picture or sound is gone - upload it again');
      if (row.questionId && row.questionId !== questionId) throw new BadRequestException('That upload already belongs to another question');
      customIds.push(id);
      return path;
    };
    const out: Record<string, unknown> = {};
    if (media.image) {
      out.image = await check(media.image, 'IMAGE');
      const alt = (media.alt ?? '').trim().slice(0, 200);
      if (!alt) throw new BadRequestException('Describe the picture in a few words (shown if it cannot load, and read aloud). Do not give away the answer.');
      out.alt = alt;
    } else if (media.alt?.trim()) {
      out.alt = media.alt.trim().slice(0, 200);
    }
    if (media.audio) out.audio = await check(media.audio, 'AUDIO');
    const imgs = Array.isArray(media.choiceImages) ? media.choiceImages : [];
    if (type === 'IMAGE_CHOICE') {
      if (imgs.length < 2 || imgs.length > 4) throw new BadRequestException('A picture question needs 2 to 4 pictures');
      const checked: string[] = [];
      for (const img of imgs) checked.push(await check(img, 'IMAGE'));
      out.choiceImages = checked;
      const alts = Array.isArray(media.choiceAlts) ? media.choiceAlts : [];
      out.choiceAlts = imgs.map((_, i) => (alts[i] ?? '').toString().trim().slice(0, 120));
    } else if (imgs.length) {
      throw new BadRequestException('Picture answers only work on a picture question');
    }
    const clean = Object.keys(out).length ? out : null;
    if (!clean && type === 'IMAGE_CHOICE') throw new BadRequestException('A picture question needs 2 to 4 pictures');
    return { clean, customIds };
  }

  async createQuestion(actorId: string, input: EduQuestionInput) {
    await this.assertOwner(actorId);
    const media = await this.cleanMedia(input.type, input.media, null, new Set());
    const dto = this.validateQuestionInput({ ...input, media: media.clean as EduMediaInput | null });
    return this.prisma.$transaction(async (tx) => {
      const q = await tx.eduQuestion.create({
        data: {
          subject: dto.subject,
          grade: dto.grade,
          type: dto.type,
          prompt: dto.prompt,
          choicesJson: dto.type === 'TEXT_INPUT' ? undefined : (dto.choices as unknown as Prisma.InputJsonValue),
          answer: dto.answer,
          acceptedJson: dto.type === 'TEXT_INPUT' && dto.acceptedAnswers?.length ? (dto.acceptedAnswers as unknown as Prisma.InputJsonValue) : undefined,
          mediaJson: media.clean ? (media.clean as unknown as Prisma.InputJsonValue) : undefined,
          active: dto.active ?? true,
          createdById: actorId,
        },
      });
      if (media.customIds.length) await tx.eduMedia.updateMany({ where: { id: { in: media.customIds } }, data: { questionId: q.id } });
      return q;
    });
  }

  async updateQuestion(actorId: string, id: string, input: Partial<EduQuestionInput>) {
    await this.assertOwner(actorId);
    const existing = await this.prisma.eduQuestion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Question not found');
    const existingMedia = (existing.mediaJson as EduMediaInput | null) ?? null;
    const type = (input.type ?? existing.type) as EduQuestionInput['type'];
    const keep = new Set<string>([
      ...(existingMedia?.image ? [existingMedia.image] : []),
      ...(existingMedia?.audio ? [existingMedia.audio] : []),
      ...(existingMedia?.choiceImages ?? []),
    ]);
    // undefined = media untouched by this edit; null/object = replace it.
    const media = await this.cleanMedia(type, input.media === undefined ? existingMedia : input.media, id, keep);
    const merged: EduQuestionInput = {
      subject: input.subject ?? existing.subject,
      grade: input.grade ?? existing.grade,
      type,
      prompt: input.prompt ?? existing.prompt,
      choices: input.choices ?? ((existing.choicesJson as string[] | null) ?? undefined),
      answer: input.answer ?? existing.answer,
      acceptedAnswers: input.acceptedAnswers ?? ((existing.acceptedJson as string[] | null) ?? undefined),
      media: media.clean as EduMediaInput | null,
      active: input.active ?? existing.active,
    };
    const dto = this.validateQuestionInput(merged);
    return this.prisma.$transaction(async (tx) => {
      // Progress rows copy the question's subject/grade when first answered;
      // moving a question must move its rows too or mastery counts drift.
      if (dto.grade !== existing.grade || dto.subject !== existing.subject) {
        await tx.eduQuestionProgress.updateMany({ where: { questionId: id }, data: { grade: dto.grade, subject: dto.subject } });
      }
      const q = await tx.eduQuestion.update({
        where: { id },
        data: {
          subject: dto.subject,
          grade: dto.grade,
          type: dto.type,
          prompt: dto.prompt,
          choicesJson: dto.type === 'TEXT_INPUT' ? Prisma.JsonNull : (dto.choices as unknown as Prisma.InputJsonValue),
          answer: dto.answer,
          acceptedJson: dto.type === 'TEXT_INPUT' && dto.acceptedAnswers?.length ? (dto.acceptedAnswers as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          mediaJson: media.clean ? (media.clean as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          active: dto.active ?? existing.active,
        },
      });
      // Uploads this question now uses are attached; any it no longer uses are
      // deleted (nothing else can reference them).
      if (media.customIds.length) await tx.eduMedia.updateMany({ where: { id: { in: media.customIds } }, data: { questionId: id } });
      await tx.eduMedia.deleteMany({ where: { questionId: id, id: { notIn: media.customIds } } });
      return q;
    });
  }

  // ---------------- Custom photos and sounds (owner uploads) ----------------

  // The in-app editor crops/resizes pictures to exactly MEDIA_SPEC.image and
  // re-encodes sounds to the canonical WAV; this re-checks the real bytes so a
  // hand-rolled request can't store anything else.
  async uploadMedia(actorId: string, dto: { kind: string; dataUri: string }) {
    await this.assertOwner(actorId);
    const kind = dto.kind === 'IMAGE' ? 'IMAGE' : dto.kind === 'AUDIO' ? 'AUDIO' : null;
    if (!kind) throw new BadRequestException('Unknown upload type');
    const buf = decodeDataUri(dto.dataUri, kind);
    if (!buf || !buf.length) throw new BadRequestException('That file could not be read');
    let data: { mime: string; width?: number; height?: number; durationMs?: number };
    if (kind === 'IMAGE') {
      const spec = MEDIA_SPEC.image;
      if (buf.length > spec.maxBytes) throw new BadRequestException('That picture file is too big - use the editor so it can be shrunk');
      const info = parseImage(buf);
      if (!info) throw new BadRequestException('Pictures must be WebP, PNG or JPEG');
      if (info.width !== spec.width || info.height !== spec.height) {
        throw new BadRequestException(`Pictures must be exactly ${spec.width} x ${spec.height} - use the picture editor to crop it`);
      }
      data = { mime: info.mime, width: info.width, height: info.height };
    } else {
      const spec = MEDIA_SPEC.audio;
      if (buf.length > spec.maxBytes) throw new BadRequestException('That sound is too long or big - keep it under 15 seconds');
      const info = parseWav(buf);
      if (!info) throw new BadRequestException('Sounds must be 44.1 kHz mono 16-bit WAV - use the sound editor to convert it');
      if (info.durationMs < spec.minMs || info.durationMs > spec.maxMs) {
        throw new BadRequestException(`Sounds must be between ${spec.minMs / 1000} and ${spec.maxMs / 1000} seconds`);
      }
      data = { mime: info.mime, durationMs: info.durationMs };
    }
    // Housekeeping: uploads never saved onto a question after 2 days.
    await this.prisma.eduMedia.deleteMany({ where: { questionId: null, createdAt: { lt: new Date(Date.now() - 2 * 86_400_000) } } });
    const row = await this.prisma.eduMedia.create({
      data: { kind, mime: data.mime, data: buf, bytes: buf.length, width: data.width, height: data.height, durationMs: data.durationMs, createdById: actorId },
      select: { id: true, kind: true, bytes: true, width: true, height: true, durationMs: true },
    });
    return { ...row, path: customMediaPath(row.id) };
  }

  async getMediaFile(id: string) {
    const row = await this.prisma.eduMedia.findUnique({ where: { id }, select: { mime: true, data: true } });
    if (!row) throw new NotFoundException('Not found');
    return { mime: row.mime, data: Buffer.from(row.data) };
  }

  // A question with real answer history stays forever (deactivate instead -
  // a kid's EduQuestionProgress row is part of THEIR record, not something
  // an owner editing the shared bank should be able to silently erase).
  // Only a question nobody's ever answered can actually be deleted.
  async deleteQuestion(actorId: string, id: string) {
    await this.assertOwner(actorId);
    const existing = await this.prisma.eduQuestion.findUnique({ where: { id }, include: { _count: { select: { progress: true } } } });
    if (!existing) throw new NotFoundException('Question not found');
    if (existing._count.progress > 0) {
      throw new BadRequestException(`${existing._count.progress} kid${existing._count.progress === 1 ? '' : 's'} already answered this - deactivate it instead of deleting.`);
    }
    await this.prisma.eduQuestion.delete({ where: { id } });
    return { ok: true };
  }
}
