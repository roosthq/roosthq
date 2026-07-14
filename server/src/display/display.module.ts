import { Module } from '@nestjs/common';
import { DisplayController } from './display.controller';
import { DisplayService } from './display.service';
import { DisplayEventsService } from './display-events.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [DisplayController],
  providers: [DisplayService, DisplayEventsService, PrismaService],
})
export class DisplayModule {}
