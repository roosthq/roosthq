import { Module } from '@nestjs/common';
import { RewardGamesController } from './reward-games.controller';
import { RewardGamesService } from './reward-games.service';
import { DisplayEventsModule } from '../display/display-events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StreakFreezeModule } from '../streak-freeze/streak-freeze.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [DisplayEventsModule, NotificationsModule, StreakFreezeModule],
  controllers: [RewardGamesController],
  providers: [RewardGamesService, PrismaService],
  exports: [RewardGamesService],
})
export class RewardGamesModule {}
