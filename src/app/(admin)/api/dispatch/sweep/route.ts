// Cron-poked endpoint that runs the escalation sweeper.
//
// Protected by a shared secret in the X-Dispatch-Token header (env
// DISPATCH_CRON_TOKEN). Returning unauthorized rather than 404 so a
// misconfigured cron job fails loud.
//
// Idempotent: sweepEscalations only acts on rows whose timer has
// already expired AND that are still open. Safe to call as often as
// you like; recommended interval is 60s.

import { NextResponse } from 'next/server';
import { sweepEscalations } from '@/lib/volunteer/dispatch';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const token = req.headers.get('x-dispatch-token');
  const expected = process.env.DISPATCH_CRON_TOKEN ?? '';
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'DISPATCH_CRON_TOKEN not configured' }, { status: 500 });
  }
  if (token !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await sweepEscalations();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Allow GET for ad-hoc testing too.
export async function GET(req: Request) {
  return POST(req);
}
