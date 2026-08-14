import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { AwardsService, AwardInput, GrantInput } from './awards.service';
import { parsePageParams } from '../common/pagination';

@UseGuards(AuthGuard)
@Controller('awards')
export class AwardsController {
  constructor(private awards: AwardsService) {}

  // Adults-only catalog (create/manage award types).
  @Get()
  catalog(@CurrentUser() u: SessionPayload) {
    return this.awards.catalog(u.familyId, u.userId);
  }

  // What a given member has actually earned - defaults to the caller.
  @Get('earned')
  earned(@CurrentUser() u: SessionPayload, @Query('userId') userId?: string) {
    return this.awards.earned(u.familyId, u.userId, userId || u.userId);
  }

  // Adults-only, family-wide grant history.
  @Get('history')
  history(@CurrentUser() u: SessionPayload, @Query('skip') skip?: string, @Query('take') take?: string) {
    const p = parsePageParams(skip, take);
    return this.awards.history(u.familyId, u.userId, p.skip, p.take);
  }

  // What the confirm dialog needs to describe the "also take the tokens back"
  // checkbox: award tokens and wheel tokens actually banked from this grant.
  @Get('grants/:grantId/impact')
  grantImpact(@CurrentUser() u: SessionPayload, @Param('grantId') grantId: string) {
    return this.awards.grantTokenImpact(u.familyId, u.userId, grantId);
  }

  // removeTokens defaults to true (previous behaviour); pass '0'/'false' to
  // keep the tokens and only take the badge back.
  @Delete('grants/:grantId')
  removeGrant(
    @CurrentUser() u: SessionPayload,
    @Param('grantId') grantId: string,
    @Query('removeTokens') removeTokens?: string,
  ) {
    const keep = removeTokens === '0' || removeTokens === 'false';
    return this.awards.removeGrant(u.familyId, u.userId, grantId, { removeTokens: !keep });
  }

  @Post()
  create(@CurrentUser() u: SessionPayload, @Body() body: AwardInput) {
    return this.awards.create(u.familyId, u.userId, body);
  }

  @Patch(':id')
  update(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: Partial<AwardInput>) {
    return this.awards.update(u.familyId, u.userId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.awards.remove(u.familyId, u.userId, id);
  }

  @Post(':id/grant')
  grant(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: GrantInput) {
    return this.awards.grant(u.familyId, u.userId, id, body);
  }
}
