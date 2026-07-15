import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
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

  @Delete(':id')
  remove(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.users.remove(u.userId, u.familyId, id);
  }

  // Current user sets their own app theme.
  @Put('me/theme')
  setTheme(@CurrentUser() u: SessionPayload, @Body() body: { theme: 'light' | 'dark' }) {
    return this.users.setTheme(u.userId, body.theme);
  }

  // Current user sets their own app text size.
  @Put('me/font-size')
  setFontSize(@CurrentUser() u: SessionPayload, @Body() body: { fontSize: 'sm' | 'md' | 'lg' | 'xl' }) {
    return this.users.setFontSize(u.userId, body.fontSize);
  }

  // Current user's own "also email me notifications" preference.
  @Put('me/notify-by-email')
  setNotifyByEmail(@CurrentUser() u: SessionPayload, @Body() body: { notifyByEmail: boolean }) {
    return this.users.setNotifyByEmail(u.userId, body.notifyByEmail);
  }
}
