import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { DisplaysService, DisplayConfigInput } from './displays.service';

@UseGuards(AuthGuard)
@Controller('displays')
export class DisplaysController {
  constructor(private displays: DisplaysService) {}

  @Get()
  list(@CurrentUser() u: SessionPayload) {
    return this.displays.list(u.familyId);
  }

  @Post()
  create(@CurrentUser() u: SessionPayload, @Body() body: DisplayConfigInput) {
    return this.displays.create(u.familyId, u.userId, body);
  }

  @Patch(':id')
  update(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: DisplayConfigInput) {
    return this.displays.update(u.familyId, u.userId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.displays.remove(u.familyId, u.userId, id);
  }
}
