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
import { CalendarsService, ShareSelection } from './calendars.service';

@UseGuards(AuthGuard)
@Controller('calendars')
export class CalendarsController {
  constructor(private calendars: CalendarsService) {}

  // Calendars available on the user's connected Google accounts (for the share picker).
  @Get('google')
  listGoogle(@CurrentUser() u: SessionPayload) {
    return this.calendars.listGoogleCalendars(u.userId);
  }

  // Whether a connected Google account needs reconnecting — checked
  // proactively on page load, not just after a click quietly does nothing.
  @Get('google/status')
  googleStatus(@CurrentUser() u: SessionPayload) {
    return this.calendars.accountStatus(u.userId);
  }

  // Share selected calendars into the family.
  @Post('share')
  share(
    @CurrentUser() u: SessionPayload,
    @Body() body: { googleAccountId: string; selections: ShareSelection[] },
  ) {
    return this.calendars.share(u.familyId, u.userId, body.googleAccountId, body.selections);
  }

  // Remove my own share of a calendar (declared before ':id'-shaped routes
  // just for readability; this path never collides with them).
  @Post('unshare')
  unshare(@CurrentUser() u: SessionPayload, @Body() body: { googleCalendarId: string }) {
    return this.calendars.unshare(u.familyId, u.userId, body.googleCalendarId);
  }

  // Shared calendars for the family, with counts.
  @Get()
  listShared(@CurrentUser() u: SessionPayload) {
    return this.calendars.listShared(u.familyId, u.userId);
  }

  // Deduped events across selected calendars in a time window.
  @Get('events')
  events(
    @CurrentUser() u: SessionPayload,
    @Query('calendarIds') calendarIds: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    const ids = (calendarIds ?? '').split(',').filter(Boolean);
    return this.calendars.events(u.familyId, ids, start, end);
  }

  @Post(':calendarId/events')
  create(
    @CurrentUser() u: SessionPayload,
    @Param('calendarId') calendarId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.calendars.createEvent(u.familyId, calendarId, u.userId, body);
  }

  @Patch(':calendarId/events/:eventId')
  update(
    @CurrentUser() u: SessionPayload,
    @Param('calendarId') calendarId: string,
    @Param('eventId') eventId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.calendars.updateEvent(u.familyId, calendarId, eventId, body);
  }

  @Delete(':calendarId/events/:eventId')
  remove(
    @CurrentUser() u: SessionPayload,
    @Param('calendarId') calendarId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.calendars.deleteEvent(u.familyId, calendarId, eventId);
  }
}
