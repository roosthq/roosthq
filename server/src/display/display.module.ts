import { Module } from '@nestjs/common';
import { DisplayController } from './display.controller';
import { DisplaysController } from './displays.controller';
import { DisplayService } from './display.service';
import { DisplaysService } from './displays.service';
import { DisplayEventsService } from './display-events.service';
import { DisplayTokenService } from './display-token.service';
import { DisplayOrUserGuard } from './display-auth.guard';
import { CalendarsService } from '../calendars/calendars.service';
import { GoogleService } from '../google/google.service';
import { PrismaService } from '../prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { LocalCalendarsService } from '../local-calendars/local-calendars.service';

@Module({
  imports: [NotificationsModule],
  controllers: [DisplayController, DisplaysController],
  providers: [
    DisplayService,
    DisplaysService,
    DisplayEventsService,
    DisplayTokenService,
    DisplayOrUserGuard,
    CalendarsService,
    GoogleService,
    PrismaService,
    LocalCalendarsService,
  ],
})
export class DisplayModule {}
