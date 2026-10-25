import { Module } from '@nestjs/common';
import { LearningService } from './learning.service';
import { LearningController } from './learning.controller';
import { LearningMediaController } from './learning-media.controller';
import { PrismaService } from '../prisma.service';

// DisplayEventsService needs no import - DisplayEventsModule is @Global(),
// same reasoning as MiniGamesModule's own comment.
@Module({
  providers: [LearningService, PrismaService],
  controllers: [LearningController, LearningMediaController],
  exports: [LearningService],
})
export class LearningModule {}
