import { Module } from '@nestjs/common';
import { ChoresController } from './chores.controller';
import { ChoresService } from './chores.service';
import { PrismaService } from '../prisma.service';
import { RewardGamesModule } from '../reward-games/reward-games.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule, RewardGamesModule],
  controllers: [ChoresController],
  providers: [ChoresService, PrismaService],
  exports: [ChoresService],
})
export class ChoresModule {}
