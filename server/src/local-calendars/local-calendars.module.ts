import { Module } from '@nestjs/common';
import { LocalCalendarsController } from './local-calendars.controller';
import { LocalCalendarsService } from './local-calendars.service';
import { PrismaService } from '../prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [LocalCalendarsController],
  providers: [LocalCalendarsService, PrismaService],
  exports: [LocalCalendarsService],
})
export class LocalCalendarsModule {}
