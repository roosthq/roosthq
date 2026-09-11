import { Module } from '@nestjs/common';
import { LearningService } from './learning.service';
import { LearningController } from './learning.controller';
import { PrismaService } from '../prisma.service';

// DisplayEventsService needs no import - DisplayEventsModule is @Global(),
// same reasoning as MiniGamesModule's own comment.
@Module({
  providers: [LearningService, PrismaService],
  controllers: [LearningController],
  exports: [LearningService],
})
export class LearningModule {}
