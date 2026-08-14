import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { StreakFreezeService } from './streak-freeze.service';

@UseGuards(AuthGuard)
@Controller('streak-freeze')
export class StreakFreezeController {
  constructor(private streakFreeze: StreakFreezeService) {}

  // The "silently" path from ProfilePage's Adjust panel - mirrors POST
  // /tokens/adjust exactly (userId/delta/reason), just a different bank.
  @Post('adjust')
  adjust(@CurrentUser() u: SessionPayload, @Body() body: { userId: string; delta: number; reason: string }) {
    return this.streakFreeze.adjust(u.userId, u.familyId, body.userId, body.delta, body.reason);
  }
}
