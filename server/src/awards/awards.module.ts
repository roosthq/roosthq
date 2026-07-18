import { Module } from '@nestjs/common';
import { AwardsController } from './awards.controller';
import { AwardsService } from './awards.service';
import { PrismaService } from '../prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [AwardsController],
  providers: [AwardsService, PrismaService],
})
export class AwardsModule {}
