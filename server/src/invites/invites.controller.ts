import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { InvitesService } from './invites.service';

@UseGuards(AuthGuard)
@Controller('invites')
export class InvitesController {
  constructor(private invites: InvitesService) {}

  @Post()
  create(
    @CurrentUser() u: SessionPayload,
    @Body() body: { role: 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID'; label?: string },
  ) {
    return this.invites.create(u.familyId, u.userId, body.role, body.label);
  }

  @Get()
  list(@CurrentUser() u: SessionPayload) {
    return this.invites.list(u.familyId);
  }

  @Delete(':id')
  revoke(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.invites.revoke(u.familyId, u.userId, id);
  }
}
