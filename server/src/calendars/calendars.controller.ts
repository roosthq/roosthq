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

  // Share selected calendars into the family.
  @Post('share')
  share(
    @CurrentUser() u: SessionPayload,
    @Body() body: { googleAccountId: string; selections: ShareSelection[] },
  ) {
    return this.calendars.share(u.familyId, u.userId, body.googleAccountId, body.selections);
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
    return this.calendars.createEvent(u.familyId, calendarId, body);
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
