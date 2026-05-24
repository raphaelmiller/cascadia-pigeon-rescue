// Cascadia Pigeon Rescue — email adapter.
//
// Wraps the Resend SDK behind a single sendEmail() call. Three operating
// modes, selected by env:
//
//   1. STUB MODE (default in dev, and whenever RESEND_API_KEY is unset
//      or starts with "STUB_"). Logs the email to the console + appends
//      to a local file at uploads/_outbox/email.log so we can eyeball
//      magic-link URLs during Phase 0 development without provisioning
//      a real Resend account.
//
//   2. RESEND MODE. RESEND_API_KEY is a real key. Emails go through the
//      Resend HTTP API. Sender is RESEND_FROM (e.g. "CPR <noreply@cpr.org>")
//      or falls back to Resend's onboarding@resend.dev when unset (handy
//      for first-day testing before DNS is configured).
//
//   3. DISABLED MODE. EMAIL_DISABLED=1. Treats every send as a successful
//      no-op. Used for tests and during incident-response cooldowns.
//
// Phase 0 ships in STUB MODE. Swap RESEND_API_KEY to a real key + restart
// to flip into real-send mode; nothing else needs to change.

import { Resend } from 'resend';
import { promises as fs } from 'node:fs';
import path from 'node:path';

type SendArgs = {
  to: string;
  subject: string;
  /** Plain-text body. Used directly for stub-mode logs and as fallback in Resend. */
  text: string;
  /** Optional HTML body. Stub mode shows it but downplays it in logs. */
  html?: string;
  /** Free-text tag for the outbox log + Resend tags. e.g. "magic-link". */
  tag?: string;
};

export type SendResult =
  | { ok: true; mode: 'stub' | 'resend' | 'disabled'; id?: string }
  | { ok: false; mode: 'stub' | 'resend' | 'disabled'; error: string };

function resolveMode(): 'stub' | 'resend' | 'disabled' {
  if (process.env.EMAIL_DISABLED === '1') return 'disabled';
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || key.startsWith('STUB_') || key === 're_xxx') return 'stub';
  return 'resend';
}

function outboxPath(): string {
  // We piggyback on the existing uploads dir so dev + prod paths are
  // already writable. Falls back to /tmp if uploads dir isn't set.
  const base = process.env.UPLOADS_DIR ||
    path.resolve(process.cwd(), 'uploads');
  return path.join(base, '_outbox', 'email.log');
}

async function appendOutbox(args: SendArgs): Promise<void> {
  try {
    const fp = outboxPath();
    await fs.mkdir(path.dirname(fp), { recursive: true });
    const stamp = new Date().toISOString();
    const line =
      `\n===== ${stamp} ${args.tag ?? 'email'} =====\n` +
      `To: ${args.to}\nSubject: ${args.subject}\n\n${args.text}\n`;
    await fs.appendFile(fp, line, 'utf8');
  } catch (err) {
    // Outbox is debug-only — never let it break a send.
    console.warn('[email] outbox append failed:', err);
  }
}

let _resend: Resend | null = null;
function client(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const mode = resolveMode();

  if (mode === 'disabled') {
    return { ok: true, mode };
  }

  if (mode === 'stub') {
    // Stub: print + persist. Magic-link URLs in the log are clickable
    // because terminal emulators auto-linkify https://... text.
    const banner = `[email:stub] → ${args.to}  ·  ${args.subject}`;
    console.log(banner);
    console.log(args.text);
    await appendOutbox(args);
    return { ok: true, mode, id: `stub_${Date.now()}` };
  }

  // mode === 'resend'
  try {
    const from = process.env.RESEND_FROM?.trim() ||
      'CPR Volunteer <onboarding@resend.dev>';
    const res = await client().emails.send({
      from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
      tags: args.tag ? [{ name: 'category', value: args.tag }] : undefined,
    });
    if (res.error) {
      console.error('[email:resend] send failed', res.error);
      return { ok: false, mode, error: res.error.message };
    }
    return { ok: true, mode, id: res.data?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[email:resend] threw', msg);
    return { ok: false, mode, error: msg };
  }
}

/** Sanity helper for an admin-side status badge. */
export function emailModeLabel(): string {
  const mode = resolveMode();
  if (mode === 'resend') return 'Resend (live)';
  if (mode === 'disabled') return 'Disabled';
  return 'Stub (console + outbox)';
}
