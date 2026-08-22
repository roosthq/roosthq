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
import { HouseholdModule } from './household/household.module';
import { RewardGamesModule } from './reward-games/reward-games.module';
import { SecurityModule } from './security/security.module';
import { SearchModule } from './search/search.module';
import { SoundsModule } from './sounds/sounds.module';
import { IconsModule } from './icons/icons.module';
import { StreakFreezeModule } from './streak-freeze/streak-freeze.module';
import { PresenceModule } from './presence/presence.module';
import { UpdatesModule } from './updates/updates.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    StreakFreezeModule,
    PresenceModule,
    SecurityModule,
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
    HouseholdModule,
    RewardGamesModule,
    SearchModule,
    SoundsModule,
    IconsModule,
    UpdatesModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
