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
  async create(@CurrentUser() u: SessionPayload, @Body() body: { name: string }) {
    await this.locations.assertAdult(u.userId);
    return this.locations.create(u.familyId, body.name);
  }

  @Patch(':id')
  async update(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: { name?: string; timezone?: string }) {
    await this.locations.assertAdult(u.userId);
    return this.locations.update(u.familyId, id, body);
  }

  @Delete(':id')
  async remove(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    await this.locations.assertAdult(u.userId);
    return this.locations.remove(u.familyId, id);
  }

  @Post('self-join')
  selfJoin(@CurrentUser() u: SessionPayload, @Body() body: { locationIds: string[] }) {
    return this.locations.selfJoin(u.familyId, u.userId, body.locationIds ?? []);
  }

  @Post(':id/assign')
  async assign(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: { userId: string }) {
    await this.locations.assertAdult(u.userId);
    return this.locations.assign(u.familyId, id, body.userId);
  }

  @Delete(':id/users/:userId')
  async unassign(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Param('userId') userId: string) {
    await this.locations.assertAdult(u.userId);
    return this.locations.unassign(u.familyId, id, userId);
  }
}
