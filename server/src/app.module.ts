import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from './prisma.service';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { CalendarsModule } from './calendars/calendars.module';
import { DisplayModule } from './display/display.module';
import { LocationsModule } from './locations/locations.module';
import { ChoresModule } from './chores/chores.module';
import { UsersModule } from './users/users.module';
import { InvitesModule } from './invites/invites.module';
import { FamilyModule } from './family/family.module';
import { TokensModule } from './tokens/tokens.module';
import { PrizesModule } from './prizes/prizes.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AuthModule,
    CalendarsModule,
    DisplayModule,
    LocationsModule,
    ChoresModule,
    UsersModule,
    InvitesModule,
    FamilyModule,
    TokensModule,
    PrizesModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
