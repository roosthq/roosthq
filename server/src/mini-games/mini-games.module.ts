import { Module } from '@nestjs/common';
import { MiniGamesService } from './mini-games.service';
import { MiniGamesController } from './mini-games.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { StreakFreezeModule } from '../streak-freeze/streak-freeze.module';

// DisplayEventsService needs no import here - DisplayEventsModule is @Global()
// specifically so any feature module can push a kiosk live-update event
// without pulling in DisplayModule itself (see that module's own comment).
@Module({
  imports: [NotificationsModule, StreakFreezeModule],
  providers: [MiniGamesService],
  controllers: [MiniGamesController],
  exports: [MiniGamesService],
})
export class MiniGamesModule {}
