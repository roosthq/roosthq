import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { HouseholdService } from './household.service';

@UseGuards(AuthGuard)
@Controller('household')
export class HouseholdController {
  constructor(private household: HouseholdService) {}

  @Get('meals')
  meals(
    @CurrentUser() u: SessionPayload,
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.household.meals(u.familyId, start, end, locationId || null);
  }

  @Put('meals/:date')
  setMeal(
    @CurrentUser() u: SessionPayload,
    @Param('date') date: string,
    @Body()
    body: {
      title?: string;
      notes?: string | null;
      locationId?: string | null;
      isEatingOut?: boolean;
      eatOutPlaceId?: string | null;
    },
  ) {
    return this.household.setMeal(u.familyId, u.userId, date, body);
  }

  @Delete('meals/:date')
  deleteMeal(@CurrentUser() u: SessionPayload, @Param('date') date: string, @Query('locationId') locationId?: string) {
    return this.household.deleteMeal(u.familyId, u.userId, date, locationId || null);
  }

  @Post('meals/:date/spin-out')
  spinEatOut(@CurrentUser() u: SessionPayload, @Param('date') date: string, @Body() body: { locationId?: string | null }) {
    return this.household.spinEatOut(u.familyId, u.userId, date, body?.locationId ?? null);
  }

  @Get('eat-out-places')
  eatOutPlaces(@CurrentUser() u: SessionPayload) {
    return this.household.eatOutPlaces(u.familyId);
  }

  @Post('eat-out-places')
  addEatOutPlace(@CurrentUser() u: SessionPayload, @Body() body: { name: string; notes?: string | null }) {
    return this.household.addEatOutPlace(u.familyId, u.userId, body);
  }

  @Patch('eat-out-places/:id')
  updateEatOutPlace(
    @CurrentUser() u: SessionPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; notes?: string | null },
  ) {
    return this.household.updateEatOutPlace(u.familyId, u.userId, id, body);
  }

  @Delete('eat-out-places/:id')
  deleteEatOutPlace(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.household.deleteEatOutPlace(u.familyId, u.userId, id);
  }

  @Get('grocery')
  grocery(@CurrentUser() u: SessionPayload, @Query('locationId') locationId?: string) {
    return this.household.grocery(u.familyId, locationId || null);
  }

  @Post('grocery')
  addGrocery(@CurrentUser() u: SessionPayload, @Body() body: { label: string; locationId?: string | null }) {
    return this.household.addGrocery(u.familyId, u.userId, body.label, body.locationId);
  }

  @Patch('grocery/:id')
  patchGrocery(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: { checked?: boolean; label?: string }) {
    return this.household.patchGrocery(u.familyId, u.userId, id, body);
  }

  @Delete('grocery/checked')
  clearChecked(@CurrentUser() u: SessionPayload, @Query('locationId') locationId?: string) {
    return this.household.clearCheckedGrocery(u.familyId, locationId || null);
  }

  @Delete('grocery/:id')
  deleteGrocery(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.household.deleteGrocery(u.familyId, u.userId, id);
  }

  @Get('countdowns')
  countdowns(@CurrentUser() u: SessionPayload, @Query('locationId') locationId?: string) {
    return this.household.countdowns(u.familyId, locationId || null);
  }

  @Post('countdowns')
  addCountdown(
    @CurrentUser() u: SessionPayload,
    @Body() body: { title: string; date: string; emoji?: string; locationId?: string | null },
  ) {
    return this.household.addCountdown(u.familyId, u.userId, body);
  }

  @Delete('countdowns/:id')
  deleteCountdown(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.household.deleteCountdown(u.familyId, u.userId, id);
  }

  @Get('announcements')
  announcements(@CurrentUser() u: SessionPayload, @Query('locationId') locationId?: string) {
    return this.household.announcements(u.familyId, locationId || null);
  }

  @Post('announcements')
  addAnnouncement(
    @CurrentUser() u: SessionPayload,
    @Body() body: { text: string; expiresInHours?: number; locationId?: string | null },
  ) {
    return this.household.addAnnouncement(u.familyId, u.userId, body);
  }

  @Delete('announcements/:id')
  deleteAnnouncement(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.household.deleteAnnouncement(u.familyId, u.userId, id);
  }
}
