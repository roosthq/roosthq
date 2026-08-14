import { Body, Controller, Get, Put, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { IconsService } from './icons.service';

@UseGuards(AuthGuard)
@Controller('icons')
export class IconsController {
  constructor(private icons: IconsService) {}

  // Bundled read: resolved effective set per icon-key plus both raw override
  // layers - any authenticated session (including a kiosk profile) can read
  // this, it drives every <AppIcon/> render.
  @Get('effective')
  effective(@CurrentUser() u: SessionPayload) {
    return this.icons.effective(u.familyId);
  }

  // Family Manager+ (this family only). iconSet: null clears the override,
  // reverting to whatever the platform default (or hardcoded NOTO) resolves to.
  @Put('family/:iconKey')
  setFamilyOverride(@CurrentUser() u: SessionPayload, @Param('iconKey') iconKey: string, @Body() body: { iconSet: string | null }) {
    return this.icons.setFamilyOverride(u.familyId, u.userId, iconKey, body.iconSet);
  }

  // Instance-owner only. Sets the platform-wide default every family inherits
  // unless it has its own FamilyIconSetting override.
  @Put('app/:iconKey')
  setAppDefault(@CurrentUser() u: SessionPayload, @Param('iconKey') iconKey: string, @Body() body: { iconSet: string | null }) {
    return this.icons.setAppDefault(u.userId, iconKey, body.iconSet);
  }
}
