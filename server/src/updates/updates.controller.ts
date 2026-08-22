import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { UpdatesService } from './updates.service';

// Owner-only (enforced in the service, same assertOwner pattern as
// OwnerController) - see PLANNING.md #15.
@UseGuards(AuthGuard)
@Controller('updates')
export class UpdatesController {
  constructor(private updates: UpdatesService) {}

  @Get('status')
  status(@CurrentUser() u: SessionPayload) {
    return this.updates.status(u.userId);
  }

  @Post('check')
  check(@CurrentUser() u: SessionPayload) {
    return this.updates.check(u.userId);
  }

  @Post('install')
  install(@CurrentUser() u: SessionPayload) {
    return this.updates.install(u.userId);
  }

  @Post('rollback')
  rollback(@CurrentUser() u: SessionPayload) {
    return this.updates.rollback(u.userId);
  }

  @Post('settings')
  saveSettings(
    @CurrentUser() u: SessionPayload,
    @Body() body: { updateChannel?: 'stable' | 'latest'; autoCheckEnabled?: boolean; autoApplyEnabled?: boolean; autoCheckHour?: number },
  ) {
    return this.updates.saveSettings(u.userId, body);
  }
}
