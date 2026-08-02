import { Global, Module } from '@nestjs/common';
import { DisplayEventsService } from './display-events.service';

// Global so any feature module (chores, prizes, awards, tokens, calendars) can
// push a live-update event to kiosk displays without importing DisplayModule
// itself, which would create a circular dependency (DisplayModule already
// depends on CalendarsModule/LocalCalendarsModule).
@Global()
@Module({
  providers: [DisplayEventsService],
  exports: [DisplayEventsService],
})
export class DisplayEventsModule {}
