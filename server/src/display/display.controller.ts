import { Body, Controller, Delete, Get, Param, Post, Put, Query, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { DisplayService, DisplaySettingsInput } from './display.service';
import { DisplayEventsService } from './display-events.service';
import { DisplayTokenService } from './display-token.service';
import { DisplayOrUserGuard, FamilyCtx, FamilyContext } from './display-auth.guard';

@Controller('display')
export class DisplayController {
  constructor(
    private display: DisplayService,
    private events: DisplayEventsService,
    private tokens: DisplayTokenService,
  ) {}

  // --- Read-only display routes: session OR display token ---

  @UseGuards(DisplayOrUserGuard)
  @Get('settings')
  get(@FamilyCtx() ctx: FamilyContext) {
    return this.display.get(ctx.familyId);
  }

  @UseGuards(DisplayOrUserGuard)
  @Get('events')
  displayEvents(
    @FamilyCtx() ctx: FamilyContext,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.display.displayEvents(ctx.familyId, start, end);
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
  mint(@CurrentUser() u: SessionPayload, @Body() body: { label?: string }) {
    return this.tokens.mint(u.familyId, u.userId, body?.label);
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
