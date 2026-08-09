import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { DisplaysService, DisplayConfigInput } from './displays.service';

@UseGuards(AuthGuard)
@Controller('displays')
export class DisplaysController {
  constructor(private displays: DisplaysService) {}

  @Get()
  list(@CurrentUser() u: SessionPayload) {
    return this.displays.list(u.familyId);
  }

  // Calendars selectable for a display: all shared calendars, or (with
  // ?locationId=) only those shared by someone assigned to that location —
  // for the Settings UI to offer valid choices as the location changes.
  @Get('calendars')
  calendarsForLocation(@CurrentUser() u: SessionPayload, @Query('locationId') locationId?: string) {
    return this.displays.calendarsForLocation(u.familyId, locationId || null);
  }

  @Post()
  create(@CurrentUser() u: SessionPayload, @Body() body: DisplayConfigInput) {
    return this.displays.create(u.familyId, u.userId, body);
  }

  @Patch(':id')
  update(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: DisplayConfigInput) {
    return this.displays.update(u.familyId, u.userId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.displays.remove(u.familyId, u.userId, id);
  }

  // Remote "reload this kiosk" — pushed over the display's own SSE stream, no
  // Pi access needed. Omit displayConfigId to reload every kiosk in the family.
  @Post('reload')
  reload(@CurrentUser() u: SessionPayload, @Body() body: { displayConfigId?: string }) {
    return this.displays.remoteReload(u.userId, u.familyId, body.displayConfigId || null);
  }
}
