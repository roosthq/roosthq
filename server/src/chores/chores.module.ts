import { Module } from '@nestjs/common';
import { ChoresController } from './chores.controller';
import { ChoresService } from './chores.service';
import { PrismaService } from '../prisma.service';
import { RewardGamesModule } from '../reward-games/reward-games.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StreakFreezeModule } from '../streak-freeze/streak-freeze.module';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [NotificationsModule, RewardGamesModule, StreakFreezeModule, PresenceModule],
  controllers: [ChoresController],
  providers: [ChoresService, PrismaService],
  exports: [ChoresService],
})
export class ChoresModule {}
