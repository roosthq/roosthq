import { Module } from '@nestjs/common';
import { PrizesController } from './prizes.controller';
import { PrizesService } from './prizes.service';
import { PrismaService } from '../prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PrizesController],
  providers: [PrizesService, PrismaService],
})
export class PrizesModule {}
