import { Module } from '@nestjs/common';
import { IconsController } from './icons.controller';
import { IconsService } from './icons.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [IconsController],
  providers: [IconsService, PrismaService],
  exports: [IconsService],
})
export class IconsModule {}
