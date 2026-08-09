import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Put, Query, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { DisplayService, DisplaySettingsInput } from './display.service';
import { DisplaysService } from './displays.service';
import { DisplayEventsService } from './display-events.service';
import { DisplayTokenService } from './display-token.service';
import { DisplayOrUserGuard, FamilyCtx, FamilyContext } from './display-auth.guard';
import { HouseholdService } from '../household/household.service';
import { FamilyService } from '../family/family.service';

@Controller('display')
export class DisplayController {
  constructor(
    private display: DisplayService,
    private displays: DisplaysService,
    private events: DisplayEventsService,
    private tokens: DisplayTokenService,
    private household: HouseholdService,
    private familySvc: FamilyService,
  ) {}

  // --- Read-only display routes: session OR display token ---

  @UseGuards(DisplayOrUserGuard)
  @Get('settings')
  get(@FamilyCtx() ctx: FamilyContext) {
    return this.display.get(ctx.familyId);
  }

  // Resolve which display layout this kiosk shows (from its token, or ?config= for
  // an owner preview). Returns name, calendars, features, theme.
  @UseGuards(DisplayOrUserGuard)
  @Get('config')
  config(@FamilyCtx() ctx: FamilyContext, @Query('config') config?: string) {
    return this.displays.resolveConfig(ctx.familyId, ctx.displayConfigId ?? config);
  }

  @UseGuards(DisplayOrUserGuard)
  @Get('events')
  async displayEvents(
    @FamilyCtx() ctx: FamilyContext,
    @Query('config') config?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const resolved = await this.displays.resolveConfig(ctx.familyId, ctx.displayConfigId ?? config);
    return this.displays.events(ctx.familyId, resolved, start, end);
  }

  // Household widgets bundle (meals / countdowns / announcements / grocery
  // count) for the kiosk - readable idle, like the rest of the display feed.
  @UseGuards(DisplayOrUserGuard)
  @Get('household')
  async householdBundle(@FamilyCtx() ctx: FamilyContext, @Query('config') config?: string) {
    const resolved = await this.displays.resolveConfig(ctx.familyId, ctx.displayConfigId ?? config);
    return this.household.displayBundle(ctx.familyId, resolved.locationId);
  }

  // Family settings the kiosk needs (token naming + which family features are
  // enabled), readable with just a display token.
  @UseGuards(DisplayOrUserGuard)
  @Get('family-settings')
  familySettings(@FamilyCtx() ctx: FamilyContext) {
    return this.familySvc.settings(ctx.familyId);
  }

  // "At a glance" feed for the idle screensaver: today's chores + events.
  @UseGuards(DisplayOrUserGuard)
  @Get('today')
  async today(@FamilyCtx() ctx: FamilyContext, @Query('config') config?: string) {
    const resolved = await this.displays.resolveConfig(ctx.familyId, ctx.displayConfigId ?? config);
    return this.displays.todaysSummary(ctx.familyId, resolved);
  }

  // Profiles for the kiosk picker - scoped to the display's location, if it has one.
  @UseGuards(DisplayOrUserGuard)
  @Get('members')
  async members(@FamilyCtx() ctx: FamilyContext, @Query('config') config?: string) {
    const resolved = await this.displays.resolveConfig(ctx.familyId, ctx.displayConfigId ?? config);
    return this.displays.membersFor(ctx.familyId, resolved.locationId);
  }

  // Family-wide token balances for the idle picker (see DisplaysService.balancesFor).
  @UseGuards(DisplayOrUserGuard)
  @Get('balances')
  balances(@FamilyCtx() ctx: FamilyContext) {
    return this.displays.balancesFor(ctx.familyId);
  }

  // Unlock a profile on the kiosk (PIN check), returns a short-lived kiosk token.
  // Rejects a profile that isn't in scope for this display's location, even if the
  // caller knows their userId - the picker isn't the only thing enforcing scope.
  @UseGuards(DisplayOrUserGuard)
  @Post('unlock')
  async unlock(
    @FamilyCtx() ctx: FamilyContext,
    @Body() body: { userId: string; pin?: string },
    @Query('config') config?: string,
  ) {
    const resolved = await this.displays.resolveConfig(ctx.familyId, ctx.displayConfigId ?? config);
    if (resolved.locationId) {
      const allowed = await this.displays.membersFor(ctx.familyId, resolved.locationId);
      if (!allowed.some((m) => m.id === body.userId)) throw new ForbiddenException('Not available on this display');
    }
    return this.display.unlock(ctx.familyId, body.userId, body.pin);
  }

  // On-the-fly light/dark toggle, right from the kiosk header - no adult
  // unlock needed, same trust level as the screensaver/refresh/fullscreen
  // buttons next to it (see DisplaysService.setTheme for why).
  @UseGuards(DisplayOrUserGuard)
  @Patch('theme')
  async setTheme(@FamilyCtx() ctx: FamilyContext, @Body() body: { theme: string }, @Query('config') config?: string) {
    const id = ctx.displayConfigId ?? config;
    if (!id) throw new NotFoundException('This display has no saved config to update');
    return this.displays.setTheme(ctx.familyId, id, body.theme);
  }

  // Live settings updates for the family (SSE). Token goes in ?token= for the kiosk.
  @UseGuards(DisplayOrUserGuard)
  @Sse('stream')
  stream(@FamilyCtx() ctx: FamilyContext): Observable<{ data: unknown }> {
    return this.events.stream(ctx.familyId);
  }

  // --- Owner-only admin routes: session required ---

  @UseGuards(AuthGuard)
  @Put('settings')
  update(@CurrentUser() u: SessionPayload, @Body() body: DisplaySettingsInput) {
    return this.display.update(u.familyId, u.userId, body);
  }

  @UseGuards(AuthGuard)
  @Post('tokens')
  mint(@CurrentUser() u: SessionPayload, @Body() body: { label?: string; displayConfigId?: string }) {
    return this.tokens.mint(u.familyId, u.userId, body?.label, body?.displayConfigId);
  }

  @UseGuards(AuthGuard)
  @Get('tokens')
  listTokens(@CurrentUser() u: SessionPayload) {
    return this.tokens.list(u.familyId);
  }

  @UseGuards(AuthGuard)
  @Delete('tokens/:id')
  revokeToken(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.tokens.revoke(u.familyId, u.userId, id);
  }
}
