import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { EmailService } from './email.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService, EmailService, PrismaService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
