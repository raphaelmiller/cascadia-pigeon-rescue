import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/health — liveness probe for the host's healthchecker.
 *
 * Does a single 1-row Prisma query so we know both the runtime and the
 * data plane are responsive. Returns 503 + a brief reason if the DB is
 * unreachable so the host can pull the instance out of rotation.
 *
 * Public — middleware allows unauthenticated access via /api/auth/*-style
 * carve-out (this route is in the public set, see middleware.ts).
 */
export async function GET() {
  const start = Date.now();
  try {
    // Cheap query that hits the DB but doesn't depend on any seeded data.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      uptimeMs: Math.round(process.uptime() * 1000),
      dbLatencyMs: Date.now() - start,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: 'db', error: (e as Error).message },
      { status: 503 },
    );
  }
}
