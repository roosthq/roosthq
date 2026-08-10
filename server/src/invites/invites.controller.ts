import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
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
    @Body() body: { role: 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID'; label?: string; familyId?: string },
  ) {
    return this.invites.create(u.familyId, u.userId, body.role, body.label, body.familyId);
  }

  @Get()
  list(@CurrentUser() u: SessionPayload) {
    return this.invites.list(u.familyId);
  }

  // Email a link for an invite that was just minted. The base URL comes from
  // the request, not the body - the client only says who to send it to.
  @Post('email')
  emailInvite(
    @CurrentUser() u: SessionPayload,
    @Body() body: { token: string; email: string },
    @Req() req: { headers: Record<string, string | string[] | undefined> },
  ) {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    const host = typeof req.headers.host === 'string' ? req.headers.host : 'localhost';
    const base = origin ?? `https://${host}`;
    return this.invites.emailInvite(u.familyId, u.userId, body.token, body.email, base);
  }

  @Delete(':id')
  revoke(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.invites.revoke(u.familyId, u.userId, id);
  }

  // Fresh token, same role/label, old one revoked - the only way to get a
  // usable link again once the original's been lost/closed (only the hash
  // is stored, by design).
  @Post(':id/regenerate')
  regenerate(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.invites.regenerate(u.familyId, u.userId, id);
  }
}
