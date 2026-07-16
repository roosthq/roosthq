import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { LocationsService } from './locations.service';

@UseGuards(AuthGuard)
@Controller('locations')
export class LocationsController {
  constructor(private locations: LocationsService) {}

  @Get()
  list(@CurrentUser() u: SessionPayload) {
    return this.locations.list(u.familyId);
  }

  @Post()
  create(@CurrentUser() u: SessionPayload, @Body() body: { name: string }) {
    return this.locations.create(u.familyId, body.name);
  }

  @Patch(':id')
  update(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: { name?: string; timezone?: string }) {
    return this.locations.update(u.familyId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.locations.remove(u.familyId, id);
  }

  @Post(':id/assign')
  assign(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: { userId: string }) {
    return this.locations.assign(u.familyId, id, body.userId);
  }

  @Delete(':id/users/:userId')
  unassign(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Param('userId') userId: string) {
    return this.locations.unassign(u.familyId, id, userId);
  }
}
