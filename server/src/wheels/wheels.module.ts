import { Module } from '@nestjs/common';
import { WheelsController } from './wheels.controller';
import { WheelsService } from './wheels.service';
import { DisplayEventsModule } from '../display/display-events.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [DisplayEventsModule],
  controllers: [WheelsController],
  providers: [WheelsService, PrismaService],
  exports: [WheelsService],
})
export class WheelsModule {}
