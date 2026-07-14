import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { CalendarsModule } from './calendars/calendars.module';
import { DisplayModule } from './display/display.module';
import { LocationsModule } from './locations/locations.module';
import { ChoresModule } from './chores/chores.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [AuthModule, CalendarsModule, DisplayModule, LocationsModule, ChoresModule, UsersModule],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
