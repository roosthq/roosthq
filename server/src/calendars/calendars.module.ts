import { Module } from '@nestjs/common';
import { CalendarsController } from './calendars.controller';
import { CalendarsService } from './calendars.service';
import { GoogleService } from '../google/google.service';
import { PrismaService } from '../prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { LocalCalendarsModule } from '../local-calendars/local-calendars.module';

@Module({
  imports: [NotificationsModule, LocalCalendarsModule],
  controllers: [CalendarsController],
  providers: [CalendarsService, GoogleService, PrismaService],
})
export class CalendarsModule {}
