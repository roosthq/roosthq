import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { AuthService } from './auth.service';
import { GoogleService } from '../google/google.service';
import { signSession, verifySession, SessionPayload } from './jwt';
import { AuthGuard, SESSION_COOKIE } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { LoginThrottleService } from '../security/login-throttle.service';

const STATE_COOKIE = 'rhq_oauth_state';
const INVITE_COOKIE = 'rhq_invite';
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173';
const PROD = process.env.NODE_ENV === 'production';

// Secure cookies over HTTPS in production (behind the Cloudflare Tunnel);
// plain cookies for local http dev.
const cookieBase = { httpOnly: true, sameSite: 'lax' as const, secure: PROD };

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private google: GoogleService,
    private throttle: LoginThrottleService,
  ) {}

  // Kick off the Google consent flow.
  // mode=self   -> add another calendar to the current user (default when signed in)
  // mode=member -> add a new family member
  @Get('google')
  login(
    @Query('mode') mode: string,
    @Query('invite') invite: string,
    @Query('reconnect') reconnect: string,
    @Res() res: Response,
  ) {
    const nonce = randomBytes(16).toString('hex');
    const cleanMode = mode === 'member' ? 'member' : 'self';
    res.cookie(STATE_COOKIE, nonce, cookieBase);
    // Carry an invite token through the Google round-trip via a short-lived cookie.
    if (invite) res.cookie(INVITE_COOKIE, invite, { ...cookieBase, maxAge: 10 * 60 * 1000 });
    // Fixing a dead refresh token needs the consent screen forced (see
    // GoogleService.authUrl) — a plain re-login won't reissue one.
    res.redirect(this.google.authUrl(`${nonce}.${cleanMode}`, reconnect === '1'));
  }

  @Get('google/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const [nonce, mode] = (state ?? '').split('.');
    if (!code || !nonce || nonce !== req.cookies?.[STATE_COOKIE]) {
      return res.redirect(`${WEB_URL}/?auth=error`);
    }
    res.clearCookie(STATE_COOKIE);

    // If already signed in, link the new account into the existing family.
    let existingUserId: string | undefined;
    let existingFamilyId: string | undefined;
    let existingGhostedBy: string | undefined;
    const existingToken = req.cookies?.[SESSION_COOKIE];
    if (existingToken) {
      try {
        const s = verifySession(existingToken);
        existingUserId = s.userId;
        existingFamilyId = s.familyId;
        existingGhostedBy = s.ghostedBy;
      } catch {
        existingUserId = undefined;
        existingFamilyId = undefined;
        existingGhostedBy = undefined;
      }
    }

    const inviteToken = req.cookies?.[INVITE_COOKIE] as string | undefined;
    if (inviteToken) res.clearCookie(INVITE_COOKIE);

    const result = await this.auth.handleGoogleCallback(code, {
      userId: existingUserId,
      familyId: existingFamilyId,
      mode: mode === 'member' ? 'member' : 'self',
      inviteToken,
    });

    // Unknown account with no invite — don't sign in, send them to a "need invite" page.
    if (result.status === 'need_invite') {
      return res.redirect(`${WEB_URL}/?auth=need_invite`);
    }

    // Keep the current owner signed in when they added a member in-browser; otherwise
    // establish/refresh the session for the account that just logged in.
    if (!result.linkedMember) {
      // mode=self reconnects/adds a Google account to whoever's ALREADY signed
      // in (result.userId === existingUserId) — re-signing the session here
      // was dropping the ghostedBy claim even when the identity didn't
      // actually change, which silently ended an app-owner's ghost session
      // (banner gone, no "return to owner") the moment they reconnected a
      // Google account while ghosted. Only carry it forward when the
      // resulting user is still the one that was ghosted — a genuine
      // identity change (a different account) should NOT inherit it.
      const ghostedBy = result.userId === existingUserId ? existingGhostedBy : undefined;
      res.cookie(SESSION_COOKIE, signSession({ userId: result.userId, familyId: result.familyId, ghostedBy }), {
        ...cookieBase,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }
    return res.redirect(`${WEB_URL}/?auth=${result.linkedMember ? 'member_added' : 'ok'}`);
  }

  // Google is optional — register/log in with just a local password instead.
  // inviteToken comes straight from the URL's ?invite= param (the SPA already
  // has it client-side) rather than the cookie dance the Google redirect
  // flow needs — there's no redirect round-trip here to carry it across.
  @Post('local/register')
  async localRegister(
    @Body() body: { displayName: string; email?: string; username?: string; password: string; inviteToken?: string },
    @Res() res: Response,
  ) {
    const result = await this.auth.registerLocal(body);
    if (result.status === 'need_invite') {
      return res.status(400).json({ message: 'An invite is required to join this family.' });
    }
    res.cookie(SESSION_COOKIE, signSession({ userId: result.userId, familyId: result.familyId }), {
      ...cookieBase,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return res.json({ ok: true });
  }

  @Post('local/login')
  async localLogin(@Body() body: { identifier: string; password: string }, @Res() res: Response) {
    // Keyed on the identifier, not the caller's IP — a family sits behind one
    // home IP, so an IP-only lockout would let one kid mashing a wrong PIN-ish
    // guess lock out the whole household. Case-insensitive to match how
    // email/username lookups already work in AuthService.loginLocal.
    const key = `login:${body.identifier.trim().toLowerCase()}`;
    this.throttle.assertNotLocked(key);
    const result = await this.auth.loginLocal(body.identifier, body.password);
    if (!result) {
      this.throttle.recordFailure(key);
      throw new UnauthorizedException('Incorrect email/username or password');
    }
    this.throttle.recordSuccess(key);
    res.cookie(SESSION_COOKIE, signSession({ userId: result.userId, familyId: result.familyId }), {
      ...cookieBase,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return res.json({ ok: true });
  }

  // Adult/owner adds a member (typically a kid) directly from Settings —
  // no invite link, no Google/email required.
  @UseGuards(AuthGuard)
  @Post('local/member')
  createLocalMember(
    @CurrentUser() u: SessionPayload,
    @Body() body: { role: 'ADULT' | 'KID'; displayName: string; email?: string; username?: string; password?: string },
  ) {
    return this.auth.createLocalMember(u.userId, u.familyId, body.role, body);
  }

  // Owner/family manager resetting someone else's password (the fallback for
  // accounts with no email), OR self-service (any role, `id` === the caller's
  // own — see AuthService.setLocalPassword for the currentPassword rule).
  @UseGuards(AuthGuard)
  @Put('local/:id/password')
  setLocalPassword(
    @CurrentUser() u: SessionPayload,
    @Param('id') id: string,
    @Body() body: { password: string; currentPassword?: string },
  ) {
    return this.auth.setLocalPassword(u.userId, u.familyId, id, body.password, body.currentPassword);
  }

  // Self-service profile edit — display name, username, email, avatar.
  @UseGuards(AuthGuard)
  @Patch('me/profile')
  updateProfile(
    @CurrentUser() u: SessionPayload,
    @Body() body: { displayName?: string; username?: string; email?: string | null; avatar?: string | null },
  ) {
    return this.auth.updateProfile(u.userId, body, u.ghostedBy);
  }

  // My own connected Google accounts — label-only (email, needs-reconnect,
  // when connected), not calendar data.
  @UseGuards(AuthGuard)
  @Get('google/accounts')
  listGoogleAccounts(@CurrentUser() u: SessionPayload) {
    return this.google.listAccounts(u.userId);
  }

  // Disconnects one of my own Google accounts. Cascades: any Calendar rows
  // shared from it (and their CalendarShare rows) go too (schema onDelete:
  // Cascade) — the frontend confirms that loudly before calling this.
  @UseGuards(AuthGuard)
  @Delete('google/accounts/:id')
  disconnectGoogleAccount(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.google.disconnectAccount(u.userId, id);
  }

  // Self-service reset, only reachable for an account with an email on file.
  @Post('local/forgot-password')
  forgotPassword(@Body() body: { email: string }) {
    return this.auth.forgotPassword(body.email);
  }

  @Post('local/reset-password')
  resetPassword(@Body() body: { token: string; password: string }) {
    return this.auth.resetPassword(body.token, body.password);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@CurrentUser() user: SessionPayload) {
    return this.auth.me(user);
  }

  @UseGuards(AuthGuard)
  @Get('members')
  members(@CurrentUser() user: SessionPayload) {
    return this.auth.members(user.familyId);
  }

  @Post('logout')
  logout(@Res() res: Response) {
    res.clearCookie(SESSION_COOKIE);
    return res.json({ ok: true });
  }
}
