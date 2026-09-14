import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@mycms/db';

// Owns its own connection lifecycle (unlike the Next.js singleton in
// packages/db, which is tuned for hot-reload dev servers, not a long-lived
// Nest process).
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
