import { Module } from '@nestjs/common';
import { TokenScaleController } from './token-scale.controller';
import { TokenScaleService } from './token-scale.service';
import { PrismaService } from '../prisma.service';

// DisplayEventsService comes from the @Global() DisplayEventsModule, not
// listed here - registering it locally too would shadow the shared
// instance every other feature module publishes/subscribes through.
@Module({
  controllers: [TokenScaleController],
  providers: [TokenScaleService, PrismaService],
})
export class TokenScaleModule {}
