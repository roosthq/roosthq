import { Module } from '@nestjs/common';
import { HouseholdController } from './household.controller';
import { HouseholdService } from './household.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { DisplayEventsModule } from '../display/display-events.module';
import { RewardGamesModule } from '../reward-games/reward-games.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [NotificationsModule, DisplayEventsModule, RewardGamesModule],
  controllers: [HouseholdController],
  providers: [HouseholdService, PrismaService],
  exports: [HouseholdService],
})
export class HouseholdModule {}
