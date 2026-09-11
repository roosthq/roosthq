import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { LearningService } from './learning.service';

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
  updateSettings(@CurrentUser() u: SessionPayload, @Body() body: { tokensPerCorrect: number; bonusPool: unknown }) {
    return this.learning.updateSettings(u.familyId, u.userId, body.tokensPerCorrect, body.bonusPool);
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
}
