import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { SearchService } from './search.service';

@UseGuards(AuthGuard)
@Controller('search')
export class SearchController {
  constructor(private search: SearchService) {}

  @Get()
  run(@CurrentUser() u: SessionPayload, @Query('q') q: string) {
    return this.search.search(u.familyId, u.userId, q || '');
  }
}
