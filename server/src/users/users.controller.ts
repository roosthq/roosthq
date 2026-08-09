import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { UsersService } from './users.service';

@UseGuards(AuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  list(@CurrentUser() u: SessionPayload) {
    return this.users.list(u.familyId);
  }

  @Put(':id/pin')
  setPin(
    @CurrentUser() u: SessionPayload,
    @Param('id') id: string,
    @Body() body: { pin: string | null },
  ) {
    return this.users.setPin(u.userId, u.familyId, id, body.pin ?? null);
  }

  @Put(':id/pin-disabled')
  setPinDisabled(
    @CurrentUser() u: SessionPayload,
    @Param('id') id: string,
    @Body() body: { disabled: boolean },
  ) {
    return this.users.setPinDisabled(u.userId, u.familyId, id, !!body.disabled);
  }

  @Put(':id/tokens-disabled')
  setTokensDisabled(
    @CurrentUser() u: SessionPayload,
    @Param('id') id: string,
    @Body() body: { disabled: boolean },
  ) {
    return this.users.setTokensDisabled(u.userId, u.familyId, id, !!body.disabled);
  }

  @Put(':id/role')
  setRole(
    @CurrentUser() u: SessionPayload,
    @Param('id') id: string,
    @Body() body: { role: 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID' },
  ) {
    return this.users.setRole(u.userId, u.familyId, id, body.role);
  }

  // Declared before ':id' - Nest matches route literals in declaration
  // order, so this must come first or ':id' would swallow "me" as a literal id.
  @Delete('me')
  removeSelf(@CurrentUser() u: SessionPayload) {
    return this.users.removeSelf(u.userId);
  }

  @Delete(':id')
  remove(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.users.remove(u.userId, u.familyId, id);
  }

  // Clears token/purchase/notification history for an account without deleting it.
  @Post(':id/reset')
  reset(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.users.resetAccount(u.userId, u.familyId, id);
  }

  // Current user sets their own app theme.
  @Put('me/theme')
  setTheme(@CurrentUser() u: SessionPayload, @Body() body: { theme: 'light' | 'dark' }) {
    return this.users.setTheme(u.userId, body.theme);
  }

  // Current user sets their own full page theme (kiosk-identifiable "micro-theme").
  @Put('me/color-theme')
  setColorTheme(@CurrentUser() u: SessionPayload, @Body() body: { colorTheme: string }) {
    return this.users.setColorTheme(u.userId, body.colorTheme);
  }

  // Current user sets their own app text size.
  @Put('me/font-size')
  setFontSize(@CurrentUser() u: SessionPayload, @Body() body: { fontSize: 'sm' | 'md' | 'lg' | 'xl' }) {
    return this.users.setFontSize(u.userId, body.fontSize);
  }

  // Current user's own "also email me notifications" preference.
  @Put('me/notify-by-email')
  setNotifyByEmail(@CurrentUser() u: SessionPayload, @Body() body: { notifyByEmail: boolean }) {
    return this.users.setNotifyByEmail(u.userId, body.notifyByEmail);
  }

  // Adult sets a member's My Day simple mode / weekly allowance.
  @Put(':id/prefs')
  setMemberPrefs(
    @CurrentUser() u: SessionPayload,
    @Param('id') id: string,
    @Body() body: { simpleMode?: boolean; allowanceTokens?: number; birthday?: string | null; disabledPermissions?: string[] },
  ) {
    return this.users.setMemberPrefs(u.userId, u.familyId, id, body);
  }

  // "What has this person given out" - adult profile stats.
  @Get(':id/given-stats')
  givenStats(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.users.givenStats(u.familyId, id);
  }

  // Current user sets their own birthday (kids can't - adults do it for them).
  @Put('me/birthday')
  setOwnBirthday(@CurrentUser() u: SessionPayload, @Body() body: { birthday: string | null }) {
    return this.users.setOwnBirthday(u.userId, body.birthday);
  }

  // Current user's own celebration-sound preference.
  @Put('me/sound-effects')
  setSoundEffects(@CurrentUser() u: SessionPayload, @Body() body: { soundEffects: boolean }) {
    return this.users.setSoundEffects(u.userId, body.soundEffects);
  }
}
