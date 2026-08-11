import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { RewardGamesService } from './reward-games.service';

// Works with a session cookie OR a kiosk profile token (AuthGuard accepts
// both), so a kid can play from their phone or from the wall display. Route
// stays `/wheels` (pre-dates the #5 rename) on purpose - renaming the HTTP
// surface too would touch every client call site for zero behavior change.
@UseGuards(AuthGuard)
@Controller('wheels')
export class RewardGamesController {
  constructor(private rewardGames: RewardGamesService) {}

  @Get('pending')
  pending(@CurrentUser() u: SessionPayload) {
    return this.rewardGames.pending(u.familyId, u.userId);
  }

  @Post(':id/spin')
  spin(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.rewardGames.spin(u.familyId, u.userId, id);
  }
}
