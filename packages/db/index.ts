import { PrismaClient } from "@prisma/client";

// Standard Next.js dev-mode singleton: avoids exhausting DB connections
// across hot-reloads. NestJS's PrismaService (apps/api) manages its own
// lifecycle instead and does not use this singleton.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient } from "@prisma/client";
export * from "@prisma/client";
