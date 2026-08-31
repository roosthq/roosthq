import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { TokenScaleService } from './token-scale.service';

@UseGuards(AuthGuard)
@Controller('token-scale')
export class TokenScaleController {
  constructor(private tokenScale: TokenScaleService) {}

  @Post('preview')
  preview(@CurrentUser() u: SessionPayload, @Body() body: { tokenValueUsd: number }) {
    return this.tokenScale.preview(u.familyId, u.userId, body.tokenValueUsd);
  }

  @Post('commit')
  commit(@CurrentUser() u: SessionPayload, @Body() body: { tokenValueUsd: number }) {
    return this.tokenScale.commit(u.familyId, u.userId, body.tokenValueUsd);
  }

  @Get('history')
  history(@CurrentUser() u: SessionPayload) {
    return this.tokenScale.history(u.familyId, u.userId);
  }
}
