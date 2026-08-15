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
    const kioskToken = req.headers['x-kiosk-token'] as string | undefined;
    const token = kioskToken ?? req.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException();
    try {
      req.user = verifySession(token);
      if (kioskToken) req.user.viaKiosk = true;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
