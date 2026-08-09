import { Global, Module } from '@nestjs/common';
import { LoginThrottleService } from './login-throttle.service';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma.service';

// @Global so AuthModule, DisplayModule, and OwnerModule (which don't
// otherwise import each other) can all inject these without wiring the
// module into every place in between.
@Global()
@Module({
  providers: [LoginThrottleService, AuditLogService, PrismaService],
  exports: [LoginThrottleService, AuditLogService],
})
export class SecurityModule {}
