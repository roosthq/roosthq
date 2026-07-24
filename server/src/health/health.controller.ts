import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let db = 'unknown';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    // uptimeSeconds catches a specific deploy failure mode: `nest start
    // --watch`'s file-change restart can lose the race with itself (two
    // processes briefly fighting over :3000) and leave an old, pre-deploy
    // process still answering requests while docker reports the container
    // as healthy and "just restarted." A tiny uptime here after a deploy
    // proves the code that's actually answering requests is fresh — an
    // old/stuck process would show an uptime much older than the restart.
    return { status: 'ok', db, service: 'roosthq-api', time: new Date().toISOString(), uptimeSeconds: Math.round(process.uptime()) };
  }
}
