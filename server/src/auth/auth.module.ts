import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleService } from '../google/google.service';
import { PrismaService } from '../prisma.service';
import { InvitesModule } from '../invites/invites.module';

@Module({
  imports: [InvitesModule],
  controllers: [AuthController],
  providers: [AuthService, GoogleService, PrismaService],
  exports: [GoogleService, PrismaService],
})
export class AuthModule {}
