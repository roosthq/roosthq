import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { RulesService, RuleInput } from './rules.service';

@UseGuards(AuthGuard)
@Controller('rules')
export class RulesController {
  constructor(private rules: RulesService) {}

  @Get()
  list(@CurrentUser() u: SessionPayload) {
    return this.rules.list(u.familyId, u.userId);
  }

  @Post()
  create(@CurrentUser() u: SessionPayload, @Body() body: RuleInput) {
    return this.rules.create(u.familyId, u.userId, body);
  }

  @Patch(':id')
  update(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: Partial<RuleInput>) {
    return this.rules.update(u.familyId, u.userId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.rules.remove(u.familyId, u.userId, id);
  }
}
