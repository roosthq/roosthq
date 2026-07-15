import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
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

  authUrl(state: string): string {
    return this.baseClient().generateAuthUrl({
      access_type: 'offline', // request a refresh token (Google issues one on first grant)
      prompt: 'select_account', // let multi-account households pick who's signing in, without
      // re-showing the full permissions screen once it's already been granted
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
}
