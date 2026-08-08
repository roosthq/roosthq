import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { WheelsService } from './wheels.service';

// Works with a session cookie OR a kiosk profile token (AuthGuard accepts
// both), so a kid can spin from their phone or from the wall display.
@UseGuards(AuthGuard)
@Controller('wheels')
export class WheelsController {
  constructor(private wheels: WheelsService) {}

  @Get('pending')
  pending(@CurrentUser() u: SessionPayload) {
    return this.wheels.pending(u.familyId, u.userId);
  }

  @Post(':id/spin')
  spin(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.wheels.spin(u.familyId, u.userId, id);
  }
}
