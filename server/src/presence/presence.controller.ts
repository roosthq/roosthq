import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { PresenceService, SetPresenceInput } from './presence.service';

@UseGuards(AuthGuard)
@Controller('presence')
export class PresenceController {
  constructor(private presence: PresenceService) {}

  @Get('me')
  mine(@CurrentUser() u: SessionPayload) {
    return this.presence.mine(u.userId);
  }

  // Read a specific family member's status - same self-or-adult-for-a-kid
  // rule as setFor below, so a profile page can preload the right modal
  // (that person's own households, not the viewer's) before it opens.
  @Get(':id')
  forUser(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.presence.forUser(u.userId, u.familyId, id);
  }

  // Set my own status - works whether this is a real session, a ghost
  // session (sets the ghosted person's status, which is exactly the point),
  // or a kiosk-token session (the kiosk's own "I'm here/I'm back" card).
  @Post()
  setMine(@CurrentUser() u: SessionPayload, @Body() body: SetPresenceInput) {
    return this.presence.set(u.userId, u.familyId, u.userId, body);
  }

  // Adult sets a kid's status directly, no ghosting needed - e.g. from the
  // kid's own profile page, or a kiosk-side quick action.
  @Post(':id')
  setFor(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: SetPresenceInput) {
    return this.presence.set(u.userId, u.familyId, id, body);
  }
}
