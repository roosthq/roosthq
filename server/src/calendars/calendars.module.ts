import { Module } from '@nestjs/common';
import { CalendarsController } from './calendars.controller';
import { CalendarsService } from './calendars.service';
import { GoogleService } from '../google/google.service';
import { PrismaService } from '../prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [CalendarsController],
  providers: [CalendarsService, GoogleService, PrismaService],
})
export class CalendarsModule {}
