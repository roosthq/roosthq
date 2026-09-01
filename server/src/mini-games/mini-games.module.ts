import { Module } from '@nestjs/common';
import { MiniGamesService } from './mini-games.service';
import { MiniGamesController } from './mini-games.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { StreakFreezeModule } from '../streak-freeze/streak-freeze.module';
import { PrismaService } from '../prisma.service';

// DisplayEventsService needs no import here - DisplayEventsModule is @Global()
// specifically so any feature module can push a kiosk live-update event
// without pulling in DisplayModule itself (see that module's own comment).
// PrismaService isn't global (AppModule's own root providers aren't
// automatically visible to feature modules), so it's declared directly here
// too - same repeated-registration pattern every other feature module
// (StreakFreezeModule, NotificationsModule, ...) already uses.
@Module({
  imports: [NotificationsModule, StreakFreezeModule],
  providers: [MiniGamesService, PrismaService],
  controllers: [MiniGamesController],
  exports: [MiniGamesService],
})
export class MiniGamesModule {}
