import { Module } from '@nestjs/common';
import { StreakFreezeController } from './streak-freeze.controller';
import { StreakFreezeService } from './streak-freeze.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [StreakFreezeController],
  providers: [StreakFreezeService, PrismaService],
  exports: [StreakFreezeService],
})
export class StreakFreezeModule {}
