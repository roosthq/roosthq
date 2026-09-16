import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { parsePageParams } from '../common/pagination';
import { LearningService, type EduQuestionInput } from './learning.service';

@UseGuards(AuthGuard)
@Controller('learning')
export class LearningController {
  constructor(private learning: LearningService) {}

  // ---- Grade settings (adult-only) ----
  @Get('grades')
  listGrades(@CurrentUser() u: SessionPayload) {
    return this.learning.listGrades(u.familyId, u.userId);
  }

  @Patch('grades')
  setGrade(@CurrentUser() u: SessionPayload, @Body() body: { userId: string; subject: string; grade: number }) {
    return this.learning.setGrade(u.familyId, u.userId, body.userId, body.subject, body.grade);
  }

  // ---- Payout settings (adult-only) ----
  @Get('settings')
  getSettings(@CurrentUser() u: SessionPayload) {
    return this.learning.getSettings(u.familyId, u.userId);
  }

  @Patch('settings')
  updateSettings(@CurrentUser() u: SessionPayload, @Body() body: { tokensPerCorrect: number; bonusPool: unknown; dailySessionCap?: number | null }) {
    return this.learning.updateSettings(u.familyId, u.userId, body.tokensPerCorrect, body.bonusPool, body.dailySessionCap);
  }

  // ---- Progress (adult-only) ----
  @Get('progress/:userId')
  getProgress(@CurrentUser() u: SessionPayload, @Param('userId') userId: string) {
    return this.learning.getProgress(u.familyId, u.userId, userId);
  }

  // ---- Sessions (the current kiosk/app profile plays as themselves) ----
  @Post('sessions')
  startSession(@CurrentUser() u: SessionPayload, @Body() body: { subject: string }) {
    return this.learning.startSession(u.familyId, u.userId, body.subject);
  }

  @Post('sessions/:id/answer')
  answer(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: { questionId: string; given: string }) {
    return this.learning.answer(u.familyId, u.userId, id, body.questionId, body.given);
  }

  @Post('sessions/:id/advance')
  advance(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.learning.advance(u.familyId, u.userId, id);
  }

  @Post('sessions/:id/abandon')
  abandon(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.learning.abandonSession(u.familyId, u.userId, id);
  }

  // ---- Question bank (owner-only - see LearningService.assertOwner) ----
  @Get('questions')
  listQuestions(
    @CurrentUser() u: SessionPayload,
    @Query('subject') subject?: string,
    @Query('grade') grade?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const page = parsePageParams(skip, take);
    return this.learning.listQuestions(
      u.userId,
      { subject, grade: grade != null && grade !== '' ? Number(grade) : undefined, type, search, activeOnly: activeOnly === 'true' },
      page.skip,
      page.take,
    );
  }

  @Get('questions/:id')
  getQuestion(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.learning.getQuestion(u.userId, id);
  }

  @Post('questions')
  createQuestion(@CurrentUser() u: SessionPayload, @Body() body: EduQuestionInput) {
    return this.learning.createQuestion(u.userId, body);
  }

  @Patch('questions/:id')
  updateQuestion(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: Partial<EduQuestionInput>) {
    return this.learning.updateQuestion(u.userId, id, body);
  }

  @Delete('questions/:id')
  deleteQuestion(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.learning.deleteQuestion(u.userId, id);
  }
}
