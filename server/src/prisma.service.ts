import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
    // Stamps every ordinary TokenLedger.create with the family's CURRENT
    // tokenValueUsd, so a token rescale later (PLANNING.md §17) can tell
    // what scale was in effect when a given row was written - without
    // touching any of the create() call sites in chores/tokens/prizes/
    // reward-games/awards/household services, and without relying on any
    // future one remembering to set it either. The rescale operation itself
    // sets tokenValueUsdAtCreation explicitly (it already knows the value
    // taking effect) and skips this lookup - see tokens.service.ts's
    // rescale(). Doesn't fire for writes made through an interactive
    // `$transaction(async (tx) => ...)` callback (those go through `tx`, a
    // separate client) - none of the existing call sites use that form for
    // ledger writes, but worth remembering if one ever does.
    this.$use(async (params, next) => {
      if (params.model === 'TokenLedger' && params.action === 'create') {
        const data = params.args.data as Record<string, unknown>;
        if (data.tokenValueUsdAtCreation === undefined && typeof data.userId === 'string') {
          const user = await this.user.findUnique({
            where: { id: data.userId },
            select: { family: { select: { tokenValueUsd: true } } },
          });
          if (user?.family) {
            data.tokenValueUsdAtCreation = user.family.tokenValueUsd;
            if (data.dollarEquivalent === undefined && typeof data.delta === 'number') {
              data.dollarEquivalent = data.delta * user.family.tokenValueUsd;
            }
          }
        }
      }
      return next(params);
    });
  }
}
