import { Module } from '@nestjs/common';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [InvitesController],
  providers: [InvitesService, PrismaService],
  exports: [InvitesService],
})
export class InvitesModule {}
