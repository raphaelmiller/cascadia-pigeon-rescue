// Surfaces "meta context" about the running system: SMS mode, email
// mode, dev-bypass status. Renders nothing when everything is in live
// mode (production should be silent).
//
// Where it renders:
//   - Top of the volunteer dispatch board (Sam's eyes)
//   - Top of /volunteers admin page (Christina's eyes)
//
// Why both: a coordinator browsing either surface should be able to
// answer "did that volunteer actually get an SMS?" without DM'ing me.

import { smsStatus } from '@/lib/notify/sms';
import { emailModeLabel } from '@/lib/notify/email';
import { AlertCircle } from 'lucide-react';

export async function SystemStatusBanner() {
  const sms = await smsStatus();
  const email = emailModeLabel();
  const devBypass = process.env.DEV_BYPASS_AUTH === '1';

  // Decide what's worth surfacing.
  const notes: { tone: 'warn' | 'info'; text: React.ReactNode }[] = [];

  if (sms.mode === 'stub') {
    notes.push({
      tone: 'warn',
      text: (
        <>
          <strong>SMS is in stub mode.</strong> Dispatch fan-out works end-to-end, but no real texts go out yet.
          Outbound messages are logged to <code className="text-[11px]">uploads/_outbox/sms.log</code> + the SmsLedger table.
          Flip <code className="text-[11px]">TWILIO_ACCOUNT_SID</code> to go live.
        </>
      ),
    });
  } else if (sms.mode === 'disabled') {
    notes.push({
      tone: 'warn',
      text: <><strong>SMS is disabled</strong> via <code className="text-[11px]">SMS_DISABLED=1</code>. No fan-out will reach volunteers.</>,
    });
  }

  if (email === 'Stub (console + outbox)') {
    notes.push({
      tone: 'warn',
      text: (
        <>
          <strong>Email (magic-link) is in stub mode.</strong> Volunteers can&apos;t sign in via email yet.
          Use the dev-bypass dropdown on the volunteer <code className="text-[11px]">/login</code> page, or set <code className="text-[11px]">RESEND_API_KEY</code> to a live key.
        </>
      ),
    });
  } else if (email === 'Disabled') {
    notes.push({
      tone: 'warn',
      text: <><strong>Email is disabled.</strong> No magic links can be sent.</>,
    });
  }

  if (devBypass) {
    notes.push({
      tone: 'info',
      text: (
        <>
          <strong>Dev bypass is ON.</strong> The volunteer <code className="text-[11px]">/login</code> page shows a dropdown
          to sign in as any volunteer without a magic link. Turn off by unsetting <code className="text-[11px]">DEV_BYPASS_AUTH</code>.
        </>
      ),
    });
  }

  // Production-ish: nothing to say.
  if (notes.length === 0) return null;

  return (
    <div className="space-y-2">
      {notes.map((n, i) => (
        <div
          key={i}
          className={`rounded-xl ring-1 px-3 py-2 text-xs flex items-start gap-2 ${
            n.tone === 'warn'
              ? 'bg-yellow-50 ring-yellow-300 text-yellow-900'
              : 'bg-sky-50 ring-sky-300 text-sky-900'
          }`}
        >
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{n.text}</span>
        </div>
      ))}
    </div>
  );
}
