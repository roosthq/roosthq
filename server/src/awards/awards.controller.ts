import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { AwardsService, AwardInput, GrantInput } from './awards.service';

@UseGuards(AuthGuard)
@Controller('awards')
export class AwardsController {
  constructor(private awards: AwardsService) {}

  // Adults-only catalog (create/manage award types).
  @Get()
  catalog(@CurrentUser() u: SessionPayload) {
    return this.awards.catalog(u.familyId, u.userId);
  }

  // What a given member has actually earned — defaults to the caller.
  @Get('earned')
  earned(@CurrentUser() u: SessionPayload, @Query('userId') userId?: string) {
    return this.awards.earned(u.familyId, u.userId, userId || u.userId);
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
