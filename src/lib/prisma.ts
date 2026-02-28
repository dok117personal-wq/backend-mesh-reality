import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

// Supabase pooler (and PgBouncer) don't keep prepared statements across connections.
// Adding pgbouncer=true disables Prisma's prepared statements so queries work with the pooler.
function getDatasourceUrl(): string {
  const url = env.database.url;
  if (!url) return url;
  const separator = url.includes('?') ? '&' : '?';
  return url.includes('pgbouncer=true') ? url : `${url}${separator}pgbouncer=true`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: getDatasourceUrl(),
    log: env.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (env.nodeEnv !== 'production') {
  globalForPrisma.prisma = prisma;
}
