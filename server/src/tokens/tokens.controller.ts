import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { TokensService } from './tokens.service';

@UseGuards(AuthGuard)
@Controller('tokens')
export class TokensController {
  constructor(private tokens: TokensService) {}

  @Get('balances')
  balances(@CurrentUser() u: SessionPayload) {
    return this.tokens.balances(u.familyId);
  }

  @Get('balance')
  balance(@CurrentUser() u: SessionPayload, @Query('userId') userId?: string) {
    return this.tokens.balance(u.familyId, userId ?? u.userId);
  }

  @Get('ledger')
  ledger(@CurrentUser() u: SessionPayload, @Query('userId') userId?: string) {
    return this.tokens.ledger(u.familyId, userId ?? u.userId);
  }

  @Post('adjust')
  adjust(
    @CurrentUser() u: SessionPayload,
    @Body() body: { userId: string; delta: number; reason: string; type?: 'MANUAL' | 'PHYSICAL' },
  ) {
    return this.tokens.adjust(u.userId, u.familyId, body.userId, body.delta, body.reason, body.type ?? 'MANUAL');
  }
}
