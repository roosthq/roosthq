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
import { parsePageParams } from '../common/pagination';

@UseGuards(AuthGuard)
@Controller('chores')
export class ChoresController {
  constructor(private chores: ChoresService) {}

  @Get()
  list(@CurrentUser() u: SessionPayload) {
    return this.chores.list(u.familyId, u.userId);
  }

  @Get('balances')
  balances(@CurrentUser() u: SessionPayload) {
    return this.chores.balances(u.familyId);
  }

  // Adults-only (owner/family manager/adult - no kid) full activity log,
  // unlike the main list's per-chore 5-instance cap. Declared before the
  // :id route so /chores/history doesn't get swallowed as a chore id.
  @Get('history')
  history(@CurrentUser() u: SessionPayload, @Query('choreId') choreId?: string, @Query('skip') skip?: string, @Query('take') take?: string) {
    const p = parsePageParams(skip, take);
    return this.chores.history(u.familyId, u.userId, choreId, p.skip, p.take);
  }

  // Owner/family-manager-only picker source for deleted chores, so their
  // audit trail (still recorded, see chores.service.ts) is reachable even
  // though they no longer show up in the normal list. Declared before the
  // :id route so /chores/deleted doesn't get swallowed as a chore id.
  @Get('deleted')
  deletedChores(@CurrentUser() u: SessionPayload) {
    return this.chores.deletedChores(u.familyId, u.userId);
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

  // Owner/family-manager-only change history for one chore (create/edit/
  // delete, who did it and what changed) - separate from the adults-visible
  // /chores/history above, which is instance activity (completed/approved),
  // not a settings audit trail.
  @Get(':id/audit')
  audit(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.chores.auditTrail(u.familyId, u.userId, id);
  }

  // Re-enable a chore to be done again now.
  @Post(':id/reopen')
  reopen(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.chores.reopen(u.familyId, u.userId, id);
  }

  @Post('instances/:instanceId/claim')
  claim(@CurrentUser() u: SessionPayload, @Param('instanceId') instanceId: string) {
    return this.chores.claim(u.familyId, u.userId, instanceId);
  }

  // Kid backs out of their own claim (still OPEN only) - separate from the
  // adult-only /assign below, which can reassign anyone's claim any time.
  @Post('instances/:instanceId/unclaim')
  unclaim(@CurrentUser() u: SessionPayload, @Param('instanceId') instanceId: string) {
    return this.chores.unclaim(u.familyId, u.userId, instanceId);
  }

  // Adult assigns/unassigns a claimed occurrence.
  @Post('instances/:instanceId/assign')
  assign(
    @CurrentUser() u: SessionPayload,
    @Param('instanceId') instanceId: string,
    @Body() body: { userId: string | null },
  ) {
    return this.chores.setClaim(u.familyId, u.userId, instanceId, body.userId ?? null);
  }

  @Post('instances/:instanceId/check')
  check(
    @CurrentUser() u: SessionPayload,
    @Param('instanceId') instanceId: string,
    @Body() body: { checklistId: string; checked: boolean },
  ) {
    return this.chores.checkItem(u.familyId, u.userId, instanceId, body.checklistId, body.checked);
  }

  @Post('instances/:instanceId/complete')
  complete(@CurrentUser() u: SessionPayload, @Param('instanceId') instanceId: string) {
    return this.chores.complete(u.familyId, u.userId, instanceId);
  }

  @Post('instances/:instanceId/skip')
  skip(@CurrentUser() u: SessionPayload, @Param('instanceId') instanceId: string) {
    return this.chores.skip(u.familyId, u.userId, instanceId);
  }

  @Post('instances/:instanceId/unskip')
  unskip(@CurrentUser() u: SessionPayload, @Param('instanceId') instanceId: string) {
    return this.chores.unskip(u.familyId, u.userId, instanceId);
  }

  @Post('instances/:instanceId/proof')
  attachProof(@CurrentUser() u: SessionPayload, @Param('instanceId') instanceId: string, @Body() body: { image: string }) {
    return this.chores.attachProof(u.familyId, u.userId, instanceId, body.image);
  }

  @Get('instances/:instanceId/proof')
  proofImage(@CurrentUser() u: SessionPayload, @Param('instanceId') instanceId: string) {
    return this.chores.proofImage(u.familyId, instanceId);
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
