import { Module } from '@nestjs/common';
import { DisplayController } from './display.controller';
import { DisplaysController } from './displays.controller';
import { DisplayService } from './display.service';
import { DisplaysService } from './displays.service';
import { DisplayEventsModule } from './display-events.module';
import { DisplayTokenService } from './display-token.service';
import { DisplayOrUserGuard } from './display-auth.guard';
import { CalendarsService } from '../calendars/calendars.service';
import { GoogleService } from '../google/google.service';
import { PrismaService } from '../prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { LocalCalendarsModule } from '../local-calendars/local-calendars.module';
import { ChoresModule } from '../chores/chores.module';
import { HolidaysModule } from '../holidays/holidays.module';

@Module({
  imports: [NotificationsModule, LocalCalendarsModule, DisplayEventsModule, ChoresModule, HolidaysModule],
  controllers: [DisplayController, DisplaysController],
  providers: [
    DisplayService,
    DisplaysService,
    DisplayTokenService,
    DisplayOrUserGuard,
    CalendarsService,
    GoogleService,
    PrismaService,
  ],
})
export class DisplayModule {}
