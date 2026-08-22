import { Module } from '@nestjs/common';
import { UpdatesController } from './updates.controller';
import { UpdatesService } from './updates.service';
import { PrismaService } from '../prisma.service';
import { AuditLogService } from '../security/audit-log.service';

@Module({
  controllers: [UpdatesController],
  providers: [UpdatesService, PrismaService, AuditLogService],
})
export class UpdatesModule {}
