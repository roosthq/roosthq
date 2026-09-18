import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifySession } from './jwt';

export const SESSION_COOKIE = 'rhq_session';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    // Kiosk token header (touch hub explicitly acting as a selected profile) takes
    // priority over an ambient cookie session - the same browser may be signed in as
    // an adult (e.g. via the owner's "Display" preview link) while a kid is selected
    // on the kiosk, and the kid's actions must not silently run as that adult.
    const token = (req.headers['x-kiosk-token'] as string) ?? req.cookies?.[SESSION_COOKIE];
    // Bare UnauthorizedException() renders as the literal word "Unauthorized"
    // in the UI's alert modal (see web/src/api.ts's req()) - fine for an
    // adult, meaningless to a kid. A kiosk session expiring mid-use is
    // supposed to be fixed silently by req()'s own refresh-and-retry before
    // it ever reaches here a second time; this message is only the
    // fallback for when that's genuinely not possible (e.g. no display
    // token at all) or for an adult's own expired cookie.
    const message = 'Your session ended - sign in again to continue.';
    if (!token) throw new UnauthorizedException(message);
    try {
      req.user = verifySession(token);
      return true;
    } catch {
      throw new UnauthorizedException(message);
    }
  }
}
