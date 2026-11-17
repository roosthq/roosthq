import { Body, Controller, Get, Put, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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

  @Get('setup-status')
  setupStatus(@CurrentUser() u: SessionPayload) {
    return this.family.setupStatus(u.familyId);
  }

  // Everything this family has entered, as one JSON download (owner/manager).
  @Get('export')
  async exportData(@CurrentUser() u: SessionPayload, @Res() res: Response) {
    const data = await this.family.exportData(u.userId, u.familyId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="roost-hq-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  }

  @Put('settings')
  update(
    @CurrentUser() u: SessionPayload,
    @Body()
    body: {
      name?: string;
      tokenName?: string;
      tokenIcon?: string;
      choreWord?: string;
      disabledFeatures?: string[];
      soundAssignments?: Record<string, SoundAssignment>;
      surpriseRewardDays?: number;
      streakWheelMin?: number;
      streakWheelMax?: number;
      streakWheelGameType?: string | null;
    },
  ) {
    return this.family.update(u.userId, u.familyId, body);
  }
}
