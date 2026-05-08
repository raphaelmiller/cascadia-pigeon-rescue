import { PrismaClient } from '@prisma/client';
import path from 'node:path';

// Singleton — Next.js reloads modules and would otherwise leak connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

async function buildClient(): Promise<PrismaClient> {
  // Production / serverless / Vercel: use Turso (libSQL over HTTP) when configured.
  // Local dev: fall back to the better-sqlite3 file adapter.
  if (process.env.TURSO_DATABASE_URL) {
    const { PrismaLibSql } = await import('@prisma/adapter-libsql');
    const adapter = new PrismaLibSql({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter });
  }
  const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
  const url =
    process.env.DATABASE_URL ||
    `file:${path.resolve(process.cwd(), 'prisma', 'dev.db')}`;
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

// Synchronous-looking export for callers; we await the promise inside.
// Top-level await works in Next.js server components and API routes.
export const prisma: PrismaClient = globalForPrisma.prisma ?? (await buildClient());

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
