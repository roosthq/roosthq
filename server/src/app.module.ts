import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from './prisma.service';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { CalendarsModule } from './calendars/calendars.module';
import { DisplayModule } from './display/display.module';
import { DisplayEventsModule } from './display/display-events.module';
import { LocationsModule } from './locations/locations.module';
import { ChoresModule } from './chores/chores.module';
import { UsersModule } from './users/users.module';
import { InvitesModule } from './invites/invites.module';
import { FamilyModule } from './family/family.module';
import { TokensModule } from './tokens/tokens.module';
import { PrizesModule } from './prizes/prizes.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RulesModule } from './rules/rules.module';
import { AwardsModule } from './awards/awards.module';
import { LocalCalendarsModule } from './local-calendars/local-calendars.module';
import { OwnerModule } from './owner/owner.module';
import { HolidaysModule } from './holidays/holidays.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DisplayEventsModule,
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
    RulesModule,
    AwardsModule,
    LocalCalendarsModule,
    OwnerModule,
    HolidaysModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
