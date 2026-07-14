import { Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { AuthService } from './auth.service';
import { GoogleService } from '../google/google.service';
import { signSession, verifySession, SessionPayload } from './jwt';
import { AuthGuard, SESSION_COOKIE } from './auth.guard';
import { CurrentUser } from './current-user.decorator';

const STATE_COOKIE = 'rhq_oauth_state';
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:5173';

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
  login(@Query('mode') mode: string, @Res() res: Response) {
    const nonce = randomBytes(16).toString('hex');
    const cleanMode = mode === 'member' ? 'member' : 'self';
    res.cookie(STATE_COOKIE, nonce, { httpOnly: true, sameSite: 'lax' });
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

    const { userId, familyId } = await this.auth.handleGoogleCallback(code, {
      userId: existingUserId,
      familyId: existingFamilyId,
      mode: mode === 'member' ? 'member' : 'self',
    });
    res.cookie(SESSION_COOKIE, signSession({ userId, familyId }), {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return res.redirect(`${WEB_URL}/?auth=ok`);
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
