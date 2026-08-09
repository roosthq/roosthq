import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { HolidaysService, HolidayRuleInput } from './holidays.service';

// Owner-only admin CRUD for the global holiday rule set - read access here is
// also owner-only (there's nothing a regular family admin needs from the raw
// rule list; they just get the rendered occurrences via /calendars/events
// once "Holidays" is in their calendarIds, same as any other calendar).
@UseGuards(AuthGuard)
@Controller('holidays')
export class HolidaysController {
  constructor(private holidays: HolidaysService) {}

  @Get()
  list(@CurrentUser() u: SessionPayload) {
    return this.holidays.list(u.userId);
  }

  @Post()
  create(@CurrentUser() u: SessionPayload, @Body() body: HolidayRuleInput) {
    return this.holidays.create(u.userId, body);
  }

  @Patch(':id')
  update(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: Partial<HolidayRuleInput>) {
    return this.holidays.update(u.userId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.holidays.remove(u.userId, id);
  }
}
