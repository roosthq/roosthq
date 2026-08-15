import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { PrizesService, PrizeInput, PrizeSuggestionInput } from './prizes.service';
import { parsePageParams } from '../common/pagination';

@UseGuards(AuthGuard)
@Controller('prizes')
export class PrizesController {
  constructor(private prizes: PrizesService) {}

  @Get()
  list(@CurrentUser() u: SessionPayload) {
    return this.prizes.list(u.familyId, u.userId);
  }

  // Purchase history (declared before ':id' routes so it isn't captured as an id).
  @Get('redemptions')
  redemptions(
    @CurrentUser() u: SessionPayload,
    @Query('userId') userId?: string,
    @Query('prizeId') prizeId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const p = parsePageParams(skip, take);
    return this.prizes.redemptions(u.familyId, u.userId, { userId, prizeId, skip: p.skip, take: p.take });
  }

  @Post()
  create(@CurrentUser() u: SessionPayload, @Body() body: PrizeInput) {
    return this.prizes.create(u.familyId, u.userId, body);
  }

  // Kid-accessible: submit a wishlist item for an adult to review.
  @Post('suggest')
  suggest(@CurrentUser() u: SessionPayload, @Body() body: PrizeSuggestionInput) {
    return this.prizes.suggest(u.familyId, u.userId, body);
  }

  @Patch(':id')
  update(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: Partial<PrizeInput>) {
    return this.prizes.update(u.familyId, u.userId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.prizes.remove(u.familyId, u.userId, id);
  }

  @Post(':id/redeem')
  redeem(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.prizes.redeem(u.familyId, u.userId, id, u);
  }

  @Post('redemptions/:id/fulfill')
  fulfill(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.prizes.setRedemptionStatus(u.familyId, u.userId, id, 'FULFILLED');
  }

  @Post('redemptions/:id/reject')
  reject(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.prizes.setRedemptionStatus(u.familyId, u.userId, id, 'REJECTED');
  }

  @Patch('redemptions/:id/used')
  markUsed(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: { used: boolean }) {
    return this.prizes.setRedemptionUsed(u.familyId, u.userId, id, body.used);
  }
}
