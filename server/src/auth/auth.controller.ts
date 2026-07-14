import { Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { AuthService } from './auth.service';
import { GoogleService } from '../google/google.service';
import { signSession, verifySession, SessionPayload } from './jwt';
import { AuthGuard, SESSION_COOKIE } from './auth.guard';
import { CurrentUser } from './current-user.decorator';

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
  ) {}

  // Kick off the Google consent flow.
  // mode=self   -> add another calendar to the current user (default when signed in)
  // mode=member -> add a new family member
  @Get('google')
  login(@Query('mode') mode: string, @Query('invite') invite: string, @Res() res: Response) {
    const nonce = randomBytes(16).toString('hex');
    const cleanMode = mode === 'member' ? 'member' : 'self';
    res.cookie(STATE_COOKIE, nonce, cookieBase);
    // Carry an invite token through the Google round-trip via a short-lived cookie.
    if (invite) res.cookie(INVITE_COOKIE, invite, { ...cookieBase, maxAge: 10 * 60 * 1000 });
    res.redirect(this.google.authUrl(`${nonce}.${cleanMode}`));
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
    const existingToken = req.cookies?.[SESSION_COOKIE];
    if (existingToken) {
      try {
        const s = verifySession(existingToken);
        existingUserId = s.userId;
        existingFamilyId = s.familyId;
      } catch {
        existingUserId = undefined;
        existingFamilyId = undefined;
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
      res.cookie(SESSION_COOKIE, signSession({ userId: result.userId, familyId: result.familyId }), {
        ...cookieBase,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }
    return res.redirect(`${WEB_URL}/?auth=${result.linkedMember ? 'member_added' : 'ok'}`);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@CurrentUser() user: SessionPayload) {
    return this.auth.me(user.userId);
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
