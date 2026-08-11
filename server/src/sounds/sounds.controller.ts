import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { SoundsService } from './sounds.service';

@UseGuards(AuthGuard)
@Controller('sounds/custom')
export class SoundsController {
  constructor(private sounds: SoundsService) {}

  @Get()
  list(@CurrentUser() u: SessionPayload) {
    return this.sounds.list(u.familyId);
  }

  @Post()
  create(@CurrentUser() u: SessionPayload, @Body() body: { label: string; dataUri: string }) {
    return this.sounds.create(u.familyId, u.userId, body);
  }

  @Delete(':id')
  remove(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.sounds.remove(u.familyId, u.userId, id);
  }
}
