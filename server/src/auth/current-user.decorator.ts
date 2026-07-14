import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SessionPayload } from './jwt';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionPayload => {
    return ctx.switchToHttp().getRequest().user;
  },
);
