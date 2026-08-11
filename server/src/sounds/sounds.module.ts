import { Module } from '@nestjs/common';
import { SoundsController } from './sounds.controller';
import { SoundsService } from './sounds.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [SoundsController],
  providers: [SoundsService, PrismaService],
  exports: [SoundsService],
})
export class SoundsModule {}
