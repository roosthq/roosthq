import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { parsePageParams } from '../common/pagination';
import { Response } from 'express';
import { AuthGuard, SESSION_COOKIE } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload, signSession } from '../auth/jwt';
import { OwnerService } from './owner.service';

const PROD = process.env.NODE_ENV === 'production';
const cookieBase = { httpOnly: true, sameSite: 'lax' as const, secure: PROD };

@UseGuards(AuthGuard)
@Controller('owner')
export class OwnerController {
  constructor(private owner: OwnerService) {}

  @Get('families')
  listFamilies(@CurrentUser() u: SessionPayload) {
    return this.owner.listFamilies(u.userId);
  }

  @Post('families')
  createFamily(@CurrentUser() u: SessionPayload, @Body() body: { name: string }) {
    return this.owner.createFamily(u.userId, body.name);
  }

  @Get('families/:id/members')
  familyMembers(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.owner.familyMembers(u.userId, id);
  }

  @Delete('families/:id')
  deleteFamily(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.owner.deleteFamily(u.userId, id);
  }

  @Patch('families/:id')
  renameFamily(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: { name: string }) {
    return this.owner.renameFamily(u.userId, id, body.name);
  }

  // Recent instance-owner actions: who deactivated/deleted/created/moved a
  // user, created/deleted/renamed a family, or ghosted as someone.
  @Get('audit-log')
  auditLog(@CurrentUser() u: SessionPayload, @Query('skip') skip?: string, @Query('take') take?: string) {
    const p = parsePageParams(skip, take);
    return this.owner.auditLog(u.userId, p.skip, p.take);
  }

  @Post('users/:id/move')
  moveUser(
    @CurrentUser() u: SessionPayload,
    @Param('id') id: string,
    @Body() body: { familyId: string; role: 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID' },
  ) {
    return this.owner.moveUser(u.userId, id, body.familyId, body.role);
  }

  @Post('users')
  createUser(
    @CurrentUser() u: SessionPayload,
    @Body()
    body: {
      familyId: string;
      role: 'OWNER' | 'FAMILY_MANAGER' | 'ADULT' | 'KID';
      displayName: string;
      email?: string;
      username?: string;
      password?: string;
    },
  ) {
    return this.owner.createUser(u.userId, body);
  }

  @Post('users/:id/active')
  setUserActive(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: { active: boolean }) {
    return this.owner.setUserActive(u.userId, id, !!body.active);
  }

  @Delete('users/:id')
  deleteUser(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.owner.deleteUser(u.userId, id);
  }

  // Mints a session acting as the target user, remembering the real owner
  // so the frontend can offer "Return to Owner" and this can be undone.
  @Post('ghost/:id')
  async ghost(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Res() res: Response) {
    const session = await this.owner.ghost(u.userId, id);
    res.cookie(SESSION_COOKIE, signSession(session), { ...cookieBase, maxAge: 30 * 24 * 60 * 60 * 1000 });
    return res.json({ ok: true });
  }

  @Post('unghost')
  async unghost(@CurrentUser() u: SessionPayload, @Res() res: Response) {
    if (!u.ghostedBy) {
      return res.status(400).json({ message: 'Not currently ghosting' });
    }
    const session = await this.owner.unghost(u.ghostedBy);
    res.cookie(SESSION_COOKIE, signSession(session), { ...cookieBase, maxAge: 30 * 24 * 60 * 60 * 1000 });
    return res.json({ ok: true });
  }
}
