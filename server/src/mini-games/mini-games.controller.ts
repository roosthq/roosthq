import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionPayload } from '../auth/jwt';
import { MiniGamesService, MiniGameInput, GrantInput, PublishInput, PublishTierInput, PlayReport } from './mini-games.service';

@UseGuards(AuthGuard)
@Controller('mini-games')
export class MiniGamesController {
  constructor(private miniGames: MiniGamesService) {}

  // ---- Catalog (adult-only) ----
  @Get()
  catalog(@CurrentUser() u: SessionPayload) {
    return this.miniGames.catalog(u.familyId, u.userId);
  }

  @Post()
  create(@CurrentUser() u: SessionPayload, @Body() body: MiniGameInput) {
    return this.miniGames.create(u.familyId, u.userId, body);
  }

  // ---- Kid-facing queues/shop - declared before :id so they don't get
  // swallowed as a mini-game id ----
  @Get('pending')
  pendingGrants(@CurrentUser() u: SessionPayload) {
    return this.miniGames.pendingGrants(u.familyId, u.userId);
  }

  @Get('shop')
  shop(@CurrentUser() u: SessionPayload) {
    return this.miniGames.listPublished(u.familyId, u.userId, true);
  }

  @Get('published')
  published(@CurrentUser() u: SessionPayload) {
    return this.miniGames.listPublished(u.familyId, u.userId, false);
  }

  @Get('purchases/pending')
  pendingPurchases(@CurrentUser() u: SessionPayload) {
    return this.miniGames.pendingPurchases(u.familyId, u.userId);
  }

  // ---- Grant play session ----
  @Post('grants/:id/start')
  startGrant(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.miniGames.startGrant(u.familyId, u.userId, id);
  }

  @Post('grants/:id/play')
  playGrant(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: PlayReport) {
    return this.miniGames.playGrant(u.familyId, u.userId, id, body);
  }

  // ---- Purchase + purchase play session ----
  @Post('tiers/:tierId/purchase')
  purchase(@CurrentUser() u: SessionPayload, @Param('tierId') tierId: string) {
    return this.miniGames.purchase(u.familyId, u.userId, tierId);
  }

  @Post('purchases/:id/start')
  startPurchase(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.miniGames.startPurchase(u.familyId, u.userId, id);
  }

  @Post('purchases/:id/play')
  playPurchase(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: PlayReport) {
    return this.miniGames.playPurchase(u.familyId, u.userId, id, body);
  }

  // ---- Publishing (adult-only) ----
  @Post('published')
  publish(@CurrentUser() u: SessionPayload, @Body() body: PublishInput) {
    return this.miniGames.publish(u.familyId, u.userId, body);
  }

  @Patch('published/:id/active')
  setPublishedActive(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: { active: boolean }) {
    return this.miniGames.setPublishedActive(u.familyId, u.userId, id, !!body.active);
  }

  @Patch('published/:id/tiers')
  updateTiers(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: { tiers: PublishTierInput[] }) {
    return this.miniGames.updateTiers(u.familyId, u.userId, id, body.tiers);
  }

  @Delete('published/:id')
  removePublished(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.miniGames.removePublished(u.familyId, u.userId, id);
  }

  // ---- Catalog entry by id, update/delete/grant - after every static route above ----
  @Patch(':id')
  update(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: Partial<MiniGameInput>) {
    return this.miniGames.update(u.familyId, u.userId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() u: SessionPayload, @Param('id') id: string) {
    return this.miniGames.remove(u.familyId, u.userId, id);
  }

  @Post(':id/grant')
  grant(@CurrentUser() u: SessionPayload, @Param('id') id: string, @Body() body: GrantInput) {
    return this.miniGames.grant(u.familyId, u.userId, id, body);
  }
}
