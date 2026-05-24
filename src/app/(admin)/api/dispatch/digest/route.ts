// Cron-poked endpoint for the daily volunteer digest.
//
// Recommended cron: 07:00 PT every day. Header-token-protected via the
// same DISPATCH_CRON_TOKEN env as the escalation sweeper.

import { NextResponse } from 'next/server';
import { sendDailyDigests } from '@/lib/volunteer/digest';

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
    const result = await sendDailyDigests();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
