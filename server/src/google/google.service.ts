import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma.service';
import { encrypt, decrypt } from '../crypto/token-crypto';

// Read/write calendar access (decided in PLANNING §13).
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
];

// Thrown in place of the raw Gaxios error so callers/the frontend can tell
// "you need to reconnect this Google account" apart from any other failure.
export const RECONNECT_REQUIRED = 'GOOGLE_RECONNECT_REQUIRED';

// Google's testing-mode OAuth apps expire refresh tokens after ~7 days (also
// happens if the person revokes access from their Google account settings).
// Once that happens every API call for that account 400s with this same
// invalid_grant, forever, until they go through consent again.
function isInvalidGrant(err: unknown): boolean {
  const e = err as { message?: string; response?: { data?: { error?: string } } } | undefined;
  return e?.message === 'invalid_grant' || e?.response?.data?.error === 'invalid_grant';
}

@Injectable()
export class GoogleService {
  constructor(private prisma: PrismaService) {}

  private baseClient(): OAuth2Client {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL,
    );
  }

  // forceConsent: Google only actually issues a refresh_token on the very
  // first grant unless the consent screen is forced - needed to fix an
  // account whose refresh_token already died, since a plain re-login (even
  // signing out of the app first) gets silently skipped straight to
  // "already authorized" and never mints a new one.
  authUrl(state: string, forceConsent = false): string {
    return this.baseClient().generateAuthUrl({
      access_type: 'offline', // request a refresh token (Google issues one on first grant)
      prompt: forceConsent ? 'consent' : 'select_account', // let multi-account households pick who's
      // signing in, without re-showing the full permissions screen once it's already been granted
      // - unless we specifically need Google to reissue a refresh token
      include_granted_scopes: true,
      scope: GOOGLE_SCOPES,
      state,
    });
  }

  async exchangeCode(code: string) {
    const client = this.baseClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: profile } = await oauth2.userinfo.get();
    return { tokens, profile };
  }

  // Build a client for a stored account; persist refreshed tokens automatically.
  async clientForAccount(accountId: string): Promise<OAuth2Client> {
    const account = await this.prisma.googleAccount.findUniqueOrThrow({ where: { id: accountId } });
    const client = this.baseClient();
    client.setCredentials(JSON.parse(decrypt(account.tokensEncrypted)));
    client.on('tokens', async (t) => {
      const current = JSON.parse(decrypt(account.tokensEncrypted));
      const merged = { ...current, ...t }; // keep refresh_token if a new one isn't returned
      await this.prisma.googleAccount.update({
        where: { id: account.id },
        data: { tokensEncrypted: encrypt(JSON.stringify(merged)) },
      });
    });
    return client;
  }

  calendar(client: OAuth2Client) {
    return google.calendar({ version: 'v3', auth: client });
  }

  // Self-service list for Profile/Settings - label-only, no calendar data.
  listAccounts(userId: string) {
    return this.prisma.googleAccount.findMany({
      where: { userId },
      select: { id: true, email: true, picture: true, needsReconnect: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Best-effort token revocation (a dead refresh token, or Google's own
  // hiccup, shouldn't block removing our own record of it) then drop the
  // row - cascades to any Calendar rows shared from this account.
  async disconnectAccount(userId: string, accountId: string) {
    const account = await this.prisma.googleAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('Google account not found');
    try {
      const client = await this.clientForAccount(accountId);
      await client.revokeCredentials();
    } catch {
      // Already disconnected on Google's side, or the refresh token's dead
      // (needsReconnect) - either way there's nothing left to revoke.
    }
    await this.prisma.googleAccount.delete({ where: { id: accountId } });
    return { ok: true };
  }

  // Run a Calendar API call against a stored account, auto-detecting a dead
  // refresh token: mark the account (so the UI can show "reconnect" without
  // waiting for another failed click) and throw a clean, recognizable error
  // instead of the raw Gaxios stack. A call that succeeds clears the flag -
  // covers the case where a previous failure was transient, not a real
  // expiry, without the person having to do anything.
  async withCalendar<T>(accountId: string, fn: (cal: calendar_v3.Calendar) => Promise<T>): Promise<T> {
    const client = await this.clientForAccount(accountId);
    try {
      const result = await fn(this.calendar(client));
      await this.prisma.googleAccount.updateMany({
        where: { id: accountId, needsReconnect: true },
        data: { needsReconnect: false },
      });
      return result;
    } catch (err) {
      if (isInvalidGrant(err)) {
        await this.prisma.googleAccount.update({ where: { id: accountId }, data: { needsReconnect: true } });
        throw new UnauthorizedException(RECONNECT_REQUIRED);
      }
      throw err;
    }
  }
}
