import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { LocalCalendarInput, LocalCalendarsService } from './local-calendars.service';

@UseGuards(AuthGuard)
@Controller('local-calendars')
export class LocalCalendarsController {
  constructor(private local: LocalCalendarsService) {}

  @Get()
  list(@CurrentUser() u: SessionPayload) {
    return this.local.listForFamily(u.familyId);
  }

  @Post()
  create(@CurrentUser() u: SessionPayload, @Body() body: LocalCalendarInput) {
    return this.local.create(u.familyId, u.userId, body);
  }

  @Patch(':id')
  update(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: Partial<LocalCalendarInput>) {
    return this.local.update(u.familyId, u.userId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.local.remove(u.familyId, u.userId, id);
  }
}
