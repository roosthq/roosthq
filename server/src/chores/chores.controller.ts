import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { ChoresService, CreateChoreDto, UpdateChoreDto } from './chores.service';

@UseGuards(AuthGuard)
@Controller('chores')
export class ChoresController {
  constructor(private chores: ChoresService) {}

  @Get()
  list(
    @CurrentUser() u: SessionPayload,
    @Query('assigneeUserId') assigneeUserId?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.chores.list(u.familyId, { assigneeUserId, locationId });
  }

  @Get('balances')
  balances(@CurrentUser() u: SessionPayload) {
    return this.chores.balances(u.familyId);
  }

  @Get(':id')
  get(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.chores.getChore(u.familyId, id);
  }

  @Post()
  create(@CurrentUser() u: SessionPayload, @Body() body: CreateChoreDto) {
    return this.chores.create(u.familyId, u.userId, body);
  }

  @Patch(':id')
  update(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: UpdateChoreDto) {
    return this.chores.update(u.familyId, u.userId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.chores.remove(u.familyId, u.userId, id);
  }

  @Post('instances/:instanceId/check')
  check(
    @CurrentUser() u: SessionPayload,
    @Param('instanceId') instanceId: string,
    @Body() body: { checklistId: string; checked: boolean },
  ) {
    return this.chores.checkItem(u.familyId, instanceId, body.checklistId, body.checked);
  }

  @Post('instances/:instanceId/complete')
  complete(@CurrentUser() u: SessionPayload, @Param('instanceId') instanceId: string) {
    return this.chores.complete(u.familyId, instanceId);
  }

  @Post('instances/:instanceId/approve')
  approve(@CurrentUser() u: SessionPayload, @Param('instanceId') instanceId: string) {
    return this.chores.approve(u.familyId, u.userId, instanceId);
  }

  @Post('instances/:instanceId/reject')
  reject(@CurrentUser() u: SessionPayload, @Param('instanceId') instanceId: string) {
    return this.chores.reject(u.familyId, u.userId, instanceId);
  }
}
