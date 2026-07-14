import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { UsersService } from './users.service';

@UseGuards(AuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  list(@CurrentUser() u: SessionPayload) {
    return this.users.list(u.familyId);
  }

  @Put(':id/pin')
  setPin(
    @CurrentUser() u: SessionPayload,
    @Param('id') id: string,
    @Body() body: { pin: string | null },
  ) {
    return this.users.setPin(u.userId, u.familyId, id, body.pin ?? null);
  }

  @Put(':id/role')
  setRole(
    @CurrentUser() u: SessionPayload,
    @Param('id') id: string,
    @Body() body: { role: 'OWNER' | 'ADULT' | 'KID' },
  ) {
    return this.users.setRole(u.userId, u.familyId, id, body.role);
  }
}
