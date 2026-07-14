import { Module } from '@nestjs/common';
import { CalendarsController } from './calendars.controller';
import { CalendarsService } from './calendars.service';
import { GoogleService } from '../google/google.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [CalendarsController],
  providers: [CalendarsService, GoogleService, PrismaService],
})
export class CalendarsModule {}
