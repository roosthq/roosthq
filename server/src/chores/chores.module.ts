import { Module } from '@nestjs/common';
import { ChoresController } from './chores.controller';
import { ChoresService } from './chores.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [ChoresController],
  providers: [ChoresService, PrismaService],
})
export class ChoresModule {}
