import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { InvitesService } from './invites.service';

// Invite links are emailed from this instance's own mailer, so the base URL
// must come from server config - never from a request header, which any
// caller (or a script holding a stolen cookie) could point at their own host.
function baseUrlFrom(_req: unknown): string {
  return (process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
}

@UseGuards(AuthGuard)
@Controller('invites')
export class InvitesController {
  constructor(private invites: InvitesService) {}

  // email is optional: given, this sends the invite right away in the same
  // request (the base URL comes from the request itself, never the body -
  // see baseUrlFrom); left out, this is just "generate a link" as before.
  @Post()
  create(
    @CurrentUser() u: SessionPayload,
    @Body() body: { role: 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID'; label?: string; familyId?: string; email?: string },
    @Req() req: { headers: Record<string, string | string[] | undefined> },
  ) {
    return this.invites.create(u.familyId, u.userId, body.role, {
      label: body.label,
      targetFamilyId: body.familyId,
      email: body.email,
      baseUrl: baseUrlFrom(req),
    });
  }

  @Get()
  list(@CurrentUser() u: SessionPayload) {
    return this.invites.list(u.familyId);
  }

  // Owner-only: any family's invites, for the instance-wide Families panel -
  // see invites.service.listForFamily.
  @Get('family/:familyId')
  listForFamily(@CurrentUser() u: SessionPayload, @Param('familyId') familyId: string) {
    return this.invites.listForFamily(u.userId, familyId);
  }

  // Resend an existing pending invite - reuses the address already on file
  // unless a different one is given. Mints a fresh token (only the hash is
  // ever stored, so the original link can't be recovered/resent as-is).
  @Post(':id/resend')
  resend(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: { email?: string }, @Req() req: { headers: Record<string, string | string[] | undefined> }) {
    return this.invites.resend(u.familyId, u.userId, id, baseUrlFrom(req), body?.email);
  }

  @Delete(':id')
  revoke(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.invites.revoke(u.familyId, u.userId, id);
  }

  // Fresh token, same role/label/email, old one revoked - the only way to
  // get a usable LINK again once the original's been lost/closed (only the
  // hash is stored, by design) without also sending another email.
  @Post(':id/regenerate')
  regenerate(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.invites.regenerate(u.familyId, u.userId, id);
  }
}
