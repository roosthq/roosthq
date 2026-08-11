import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { FamilyService } from './family.service';
import { SoundAssignment } from '../common/features';

@UseGuards(AuthGuard)
@Controller('family')
export class FamilyController {
  constructor(private family: FamilyService) {}

  @Get('settings')
  settings(@CurrentUser() u: SessionPayload) {
    return this.family.settings(u.familyId);
  }

  @Put('settings')
  update(
    @CurrentUser() u: SessionPayload,
    @Body()
    body: {
      name?: string;
      tokenName?: string;
      tokenIcon?: string;
      tokenValueUsd?: number;
      choreWord?: string;
      disabledFeatures?: string[];
      soundAssignments?: Record<string, SoundAssignment>;
    },
  ) {
    return this.family.update(u.userId, u.familyId, body);
  }
}
