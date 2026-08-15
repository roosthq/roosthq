import { Body, Controller, Delete, Get, Param, Post, Put, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard, SESSION_COOKIE } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload, signSession } from '../auth/jwt';
import { UsersService } from './users.service';

const PROD = process.env.NODE_ENV === 'production';
const cookieBase = { httpOnly: true, sameSite: 'lax' as const, secure: PROD };

@UseGuards(AuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  // "Hand me your phone" - any adult ghosts as one of their own kids, so the
  // kid can complete a chore etc. on hardware that's already unlocked.
  @Post(':id/ghost')
  async ghostChild(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Res() res: Response) {
    const session = await this.users.ghostChild(u.userId, u.familyId, id);
    res.cookie(SESSION_COOKIE, signSession(session), { ...cookieBase, maxAge: 30 * 24 * 60 * 60 * 1000 });
    return res.json({ ok: true });
  }

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

  // #4 - checked whenever a surface is actually looking at this person
  // (their own profile, a kiosk unlock, the kiosk stats modal). Atomically
  // bumps lastCelebratedLevel in the same request so it never double-fires.
  @Get('me/level-check')
  levelCheck(@CurrentUser() u: SessionPayload) {
    return this.users.levelCheck(u.userId);
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
