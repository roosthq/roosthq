import { Module } from '@nestjs/common';
import { PrizesController } from './prizes.controller';
import { PrizesService } from './prizes.service';
import { PrismaService } from '../prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [NotificationsModule, PresenceModule],
  controllers: [PrizesController],
  providers: [PrizesService, PrismaService],
})
export class PrizesModule {}
