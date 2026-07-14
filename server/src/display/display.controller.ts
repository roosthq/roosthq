import { Body, Controller, Get, Put, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { DisplayService, DisplaySettingsInput } from './display.service';
import { DisplayEventsService } from './display-events.service';

@Controller('display')
export class DisplayController {
  constructor(
    private display: DisplayService,
    private events: DisplayEventsService,
  ) {}

  @UseGuards(AuthGuard)
  @Get('settings')
  get(@CurrentUser() u: SessionPayload) {
    return this.display.get(u.familyId);
  }

  @UseGuards(AuthGuard)
  @Put('settings')
  update(@CurrentUser() u: SessionPayload, @Body() body: DisplaySettingsInput) {
    return this.display.update(u.familyId, u.userId, body);
  }

  // Live stream of display-setting changes for the current family (SSE).
  @UseGuards(AuthGuard)
  @Sse('stream')
  stream(@CurrentUser() u: SessionPayload): Observable<{ data: unknown }> {
    return this.events.stream(u.familyId);
  }
}
