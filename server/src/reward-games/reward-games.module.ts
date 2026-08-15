import { Module } from '@nestjs/common';
import { RewardGamesController } from './reward-games.controller';
import { RewardGamesService } from './reward-games.service';
import { DisplayEventsModule } from '../display/display-events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StreakFreezeModule } from '../streak-freeze/streak-freeze.module';
import { PrismaService } from '../prisma.service';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [DisplayEventsModule, NotificationsModule, StreakFreezeModule, PresenceModule],
  controllers: [RewardGamesController],
  providers: [RewardGamesService, PrismaService],
  exports: [RewardGamesService],
})
export class RewardGamesModule {}
