import { Module } from '@nestjs/common';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [HolidaysController],
  providers: [HolidaysService, PrismaService],
  exports: [HolidaysService],
})
export class HolidaysModule {}
