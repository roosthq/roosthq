import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifySession } from './jwt';

export const SESSION_COOKIE = 'rhq_session';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException();
    try {
      req.user = verifySession(token);
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
