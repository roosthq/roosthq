import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { verifySession } from '../auth/jwt';
import { SESSION_COOKIE } from '../auth/auth.guard';
import { DisplayTokenService } from './display-token.service';

export interface FamilyContext {
  familyId: string;
  userId?: string;
  isDisplay: boolean;
  displayConfigId?: string | null;
}

// Accepts EITHER a signed-in user session (cookie) OR a display token
// (?token=... query param, or x-display-token header). Used for read-only
// display routes so an unattended kiosk can render without a human login.
@Injectable()
export class DisplayOrUserGuard implements CanActivate {
  constructor(private tokens: DisplayTokenService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();

    // Display token takes priority over an ambient cookie - a kiosk link carries
    // an explicit "show this specific display" instruction that must win even in
    // a browser that also happens to have an owner session cookie (e.g. testing
    // multiple kiosk links from the same admin browser tab). Same fix as
    // AuthGuard's x-kiosk-token priority.
    const raw = (req.query?.token as string) || (req.headers['x-display-token'] as string);
    if (raw) {
      const resolved = await this.tokens.resolve(raw);
      if (resolved) {
        req.familyCtx = {
          familyId: resolved.familyId,
          isDisplay: true,
          displayConfigId: resolved.displayConfigId,
        };
        return true;
      }
    }

    const sessionToken = req.cookies?.[SESSION_COOKIE];
    if (sessionToken) {
      try {
        const s = verifySession(sessionToken);
        req.familyCtx = { familyId: s.familyId, userId: s.userId, isDisplay: false };
        return true;
      } catch {
        /* fall through */
      }
    }

    throw new UnauthorizedException();
  }
}

export const FamilyCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): FamilyContext => {
    return ctx.switchToHttp().getRequest().familyCtx;
  },
);
