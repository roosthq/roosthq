import { Module } from '@nestjs/common';
import { TokensController } from './tokens.controller';
import { TokensService } from './tokens.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [TokensController],
  providers: [TokensService, PrismaService],
})
export class TokensModule {}
