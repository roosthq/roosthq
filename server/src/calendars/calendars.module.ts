import { Module } from '@nestjs/common';
import { CalendarsController } from './calendars.controller';
import { CalendarsService } from './calendars.service';
import { GoogleService } from '../google/google.service';
import { PrismaService } from '../prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { LocalCalendarsService } from '../local-calendars/local-calendars.service';

@Module({
  imports: [NotificationsModule],
  controllers: [CalendarsController],
  providers: [CalendarsService, GoogleService, PrismaService, LocalCalendarsService],
})
export class CalendarsModule {}
