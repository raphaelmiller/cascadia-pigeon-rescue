// Cascadia Pigeon Rescue — SMS adapter.
//
// Wraps Twilio + a hard monthly spend ceiling. Three modes, mirroring
// email.ts:
//
//   1. STUB MODE — default until TWILIO_ACCOUNT_SID is a real SID. Logs
//      the message to console + uploads/_outbox/sms.log. Returns a fake
//      message id so the rest of the system thinks it sent.
//
//   2. TWILIO MODE — full set of TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN +
//      TWILIO_FROM. Sends via Twilio Messages API.
//
//   3. DISABLED MODE — SMS_DISABLED=1. No-op.
//
// Per-month spend ceiling: SMS_MONTHLY_CEILING_USD (default 50). We track
// dispatch count in a SmsLedger table (one row per send) and refuse to
// dispatch when the running month's estimated cost would exceed the
// ceiling. The cost-per-message estimate is set by SMS_COST_PER_MSG_USD
// (default 0.008 — Twilio US SMS price as of 2026-05).
//
// Phase 0 ships in STUB MODE. When you swap in a real Twilio SID, the
// ceiling enforcement turns on automatically (the ledger row gets written
// in stub mode too, so the running cost meter is meaningful even pre-flip).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/prisma';

type SendArgs = {
  to: string; // E.164 phone, e.g. "+15035551234"
  body: string;
  /** Free-text tag for the outbox log + Twilio analytics. e.g. "rescue-claim". */
  tag?: string;
  /**
   * Optional dedupe key. If supplied, we'll refuse to send a second SMS
   * with the same key within the dedupe window (default 5 minutes).
   * Used to prevent fan-out loops from sending the same message N times
   * to the same volunteer for the same event.
   */
  dedupeKey?: string;
};

export type SmsResult =
  | { ok: true;  mode: 'stub' | 'twilio' | 'disabled'; sid?: string }
  | { ok: false; mode: 'stub' | 'twilio' | 'disabled'; error: string;
      reason?: 'ceiling' | 'dedupe' | 'invalid' | 'send_failed' };

function resolveMode(): 'stub' | 'twilio' | 'disabled' {
  if (process.env.SMS_DISABLED === '1') return 'disabled';
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const tok = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !tok || sid.startsWith('STUB_') || sid === 'ACxxxx') return 'stub';
  return 'twilio';
}

function outboxPath(): string {
  const base = process.env.UPLOADS_DIR ||
    path.resolve(process.cwd(), 'uploads');
  return path.join(base, '_outbox', 'sms.log');
}

async function appendOutbox(args: SendArgs): Promise<void> {
  try {
    const fp = outboxPath();
    await fs.mkdir(path.dirname(fp), { recursive: true });
    const stamp = new Date().toISOString();
    const line = `\n[${stamp}] ${args.tag ?? 'sms'} → ${args.to}\n${args.body}\n`;
    await fs.appendFile(fp, line, 'utf8');
  } catch (err) {
    console.warn('[sms] outbox append failed:', err);
  }
}

// ---- Budget ceiling -----------------------------------------------------

function ceilingUsd(): number {
  const raw = process.env.SMS_MONTHLY_CEILING_USD;
  const n = raw ? Number(raw) : 50;
  return Number.isFinite(n) && n > 0 ? n : 50;
}

function costPerMsg(): number {
  const raw = process.env.SMS_COST_PER_MSG_USD;
  const n = raw ? Number(raw) : 0.008;
  return Number.isFinite(n) && n > 0 ? n : 0.008;
}

/**
 * Sum estimatedCostUsd over all rows in the current calendar month.
 * Returns the running total in USD.
 */
async function monthSpend(): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const rows = await prisma.smsLedger.aggregate({
    where: { createdAt: { gte: startOfMonth } },
    _sum: { estimatedCostUsd: true },
  });
  return rows._sum.estimatedCostUsd ?? 0;
}

async function withinCeiling(extraCost: number): Promise<boolean> {
  const spent = await monthSpend();
  return spent + extraCost <= ceilingUsd();
}

async function dedupeHit(key: string): Promise<boolean> {
  const windowMs = 5 * 60 * 1000;
  const since = new Date(Date.now() - windowMs);
  const hit = await prisma.smsLedger.findFirst({
    where: { dedupeKey: key, createdAt: { gte: since } },
    select: { id: true },
  });
  return !!hit;
}

// ---- E.164 validation ---------------------------------------------------

function looksLikeE164(s: string): boolean {
  // Loose: +<countrycode><digits>, 8..15 digits total. Twilio is stricter
  // but a basic guard here saves Twilio API calls + dollars on typos.
  return /^\+[1-9]\d{7,14}$/.test(s);
}

// ---- Twilio client (lazy) ----------------------------------------------

let _twilio: ReturnType<typeof import('twilio')> | null = null;
async function client() {
  if (!_twilio) {
    const twilio = (await import('twilio')).default;
    _twilio = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return _twilio;
}

// ---- Public API ---------------------------------------------------------

export async function sendSms(args: SendArgs): Promise<SmsResult> {
  const mode = resolveMode();

  if (mode === 'disabled') {
    return { ok: true, mode };
  }

  if (!looksLikeE164(args.to)) {
    return { ok: false, mode, reason: 'invalid', error: `Not an E.164 number: ${args.to}` };
  }

  if (args.dedupeKey && await dedupeHit(args.dedupeKey)) {
    return { ok: false, mode, reason: 'dedupe', error: 'Duplicate within dedupe window' };
  }

  const est = costPerMsg();
  if (!(await withinCeiling(est))) {
    return { ok: false, mode, reason: 'ceiling',
      error: `Monthly SMS ceiling ($${ceilingUsd().toFixed(2)}) would be exceeded.` };
  }

  if (mode === 'stub') {
    console.log(`[sms:stub] → ${args.to}  ·  ${args.tag ?? ''}`);
    console.log(args.body);
    await appendOutbox(args);
    await prisma.smsLedger.create({
      data: {
        to: args.to,
        body: args.body,
        tag: args.tag ?? null,
        dedupeKey: args.dedupeKey ?? null,
        provider: 'stub',
        providerSid: `stub_${Date.now()}`,
        estimatedCostUsd: est,
        status: 'sent_stub',
      },
    });
    return { ok: true, mode, sid: `stub_${Date.now()}` };
  }

  // mode === 'twilio'
  try {
    const c = await client();
    const msg = await c.messages.create({
      to: args.to,
      from: process.env.TWILIO_FROM,
      body: args.body,
    });
    await prisma.smsLedger.create({
      data: {
        to: args.to,
        body: args.body,
        tag: args.tag ?? null,
        dedupeKey: args.dedupeKey ?? null,
        provider: 'twilio',
        providerSid: msg.sid,
        estimatedCostUsd: est,
        status: msg.status ?? 'queued',
      },
    });
    return { ok: true, mode, sid: msg.sid };
  } catch (err) {
    const e = err as { message?: string; code?: number };
    const msg = e.message ?? String(err);
    console.error('[sms:twilio] threw', msg);
    await prisma.smsLedger.create({
      data: {
        to: args.to,
        body: args.body,
        tag: args.tag ?? null,
        dedupeKey: args.dedupeKey ?? null,
        provider: 'twilio',
        providerSid: null,
        estimatedCostUsd: 0,
        status: `error:${e.code ?? 'unknown'}`,
      },
    });
    return { ok: false, mode, reason: 'send_failed', error: msg };
  }
}

export async function smsStatus(): Promise<{
  mode: 'stub' | 'twilio' | 'disabled';
  ceilingUsd: number;
  spentUsd: number;
  remainingUsd: number;
}> {
  const mode = resolveMode();
  const spent = await monthSpend();
  const ceiling = ceilingUsd();
  return {
    mode,
    ceilingUsd: ceiling,
    spentUsd: spent,
    remainingUsd: Math.max(0, ceiling - spent),
  };
}
