import { Body, Controller, Get, Put, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { IconsService, SlotPick } from './icons.service';

@UseGuards(AuthGuard)
@Controller('icons')
export class IconsController {
  constructor(private icons: IconsService) {}

  // Bundled read: sparse family/app slot overrides - any authenticated
  // session (including a kiosk profile) can read this, it drives every
  // slot-aware <LucideIcon/> render.
  @Get('effective')
  effective(@CurrentUser() u: SessionPayload) {
    return this.icons.effective(u.familyId);
  }

  // Family Manager+ (this family only). Body null clears the override,
  // reverting to whatever the platform pick (or the slot's own hardcoded
  // default) resolves to.
  @Put('family/:slotId')
  setFamilySlot(@CurrentUser() u: SessionPayload, @Param('slotId') slotId: string, @Body() body: SlotPick | null) {
    return this.icons.setFamilySlot(u.familyId, u.userId, slotId, body);
  }

  // Instance-owner only. Sets the platform-wide pick every family inherits
  // unless it has its own FamilySlotIcon override.
  @Put('app/:slotId')
  setAppSlot(@CurrentUser() u: SessionPayload, @Param('slotId') slotId: string, @Body() body: SlotPick | null) {
    return this.icons.setAppSlot(u.userId, slotId, body);
  }
}
