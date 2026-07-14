import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GoogleService } from '../google/google.service';
import { encrypt } from '../crypto/token-crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private google: GoogleService,
  ) {}

  // Handle the OAuth callback.
  //  - existing account         -> sign in
  //  - signed in + mode 'self'  -> attach this Google account to the CURRENT user
  //  - signed in + mode 'member'-> create a new ADULT person in the family
  //  - not signed in            -> create a new family with this account as OWNER
  async handleGoogleCallback(
    code: string,
    ctx: { userId?: string; familyId?: string; mode?: 'self' | 'member' },
  ) {
    const { tokens, profile } = await this.google.exchangeCode(code);
    const googleSub = profile.id as string;
    const email = profile.email ?? undefined;
    const name = profile.name ?? email ?? 'Member';
    const avatar = profile.picture ?? undefined;
    const encTokens = encrypt(JSON.stringify(tokens));

    const existing = await this.prisma.googleAccount.findUnique({
      where: { googleSub },
      include: { user: true },
    });

    // Returning account — refresh stored tokens and sign in.
    if (existing) {
      await this.prisma.googleAccount.update({
        where: { id: existing.id },
        data: { tokensEncrypted: encTokens },
      });
      return { userId: existing.userId, familyId: existing.user.familyId };
    }

    // Signed in, adding another of the current user's own calendars.
    if (ctx.familyId && ctx.userId && ctx.mode === 'self') {
      await this.prisma.googleAccount.create({
        data: { userId: ctx.userId, googleSub, tokensEncrypted: encTokens },
      });
      return { userId: ctx.userId, familyId: ctx.familyId };
    }

    // Signed in, adding a new family member.
    if (ctx.familyId) {
      const user = await this.prisma.user.create({
        data: { familyId: ctx.familyId, role: 'ADULT', displayName: name, email, avatar },
      });
      await this.prisma.googleAccount.create({
        data: { userId: user.id, googleSub, tokensEncrypted: encTokens },
      });
      return { userId: user.id, familyId: ctx.familyId };
    }

    // Brand-new family with this account as OWNER.
    const family = await this.prisma.family.create({ data: { name: `${name}'s Family` } });
    const user = await this.prisma.user.create({
      data: { familyId: family.id, role: 'OWNER', displayName: name, email, avatar },
    });
    await this.prisma.googleAccount.create({
      data: { userId: user.id, googleSub, tokensEncrypted: encTokens },
    });
    return { userId: user.id, familyId: family.id };
  }

  me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        email: true,
        role: true,
        avatar: true,
        familyId: true,
      },
    });
  }

  // All members of a family, for profile switching on shared devices.
  members(familyId: string) {
    return this.prisma.user.findMany({
      where: { familyId },
      select: { id: true, displayName: true, role: true, avatar: true },
    });
  }
}
