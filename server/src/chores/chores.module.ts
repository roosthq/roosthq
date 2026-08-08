import { Module } from '@nestjs/common';
import { ChoresController } from './chores.controller';
import { ChoresService } from './chores.service';
import { PrismaService } from '../prisma.service';
import { WheelsModule } from '../wheels/wheels.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule, WheelsModule],
  controllers: [ChoresController],
  providers: [ChoresService, PrismaService],
  exports: [ChoresService],
})
export class ChoresModule {}
