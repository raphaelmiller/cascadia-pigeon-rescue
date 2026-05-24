// Foster's "My Birds" page. Shows the birds in their care, a quick
// daily check-in form, and recent check-in history (theirs).

import { requireAnyRole } from '@/lib/volunteer/auth';
import { prisma } from '@/lib/prisma';
import { submitCheckIn } from './actions';
import { Bird, CheckCircle2, Eye, AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PULSE_LABEL: Record<string, string> = {
  all_good: 'All good',
  watching: 'Watching',
  concern: 'Have a concern',
};
const PULSE_TONE: Record<string, { bg: string; ring: string; icon: typeof CheckCircle2 }> = {
  all_good: { bg: 'bg-emerald-100 text-emerald-900', ring: 'ring-emerald-300', icon: CheckCircle2 },
  watching: { bg: 'bg-yellow-100 text-yellow-900', ring: 'ring-yellow-300', icon: Eye },
  concern:  { bg: 'bg-red-100 text-red-900', ring: 'ring-red-300', icon: AlertCircle },
};

export default async function VolunteerBirdsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const sp = await searchParams;
  const v = await requireAnyRole(['foster', 'lead_foster', 'med_admin']);

  const [birds, recentCheckIns, lastCheckIn] = await Promise.all([
    v.fosterId
      ? prisma.bird.findMany({
          where: { fosterId: v.fosterId, deletedAt: null, archivedAt: null },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, species: true, status: true, medicalPriority: true },
        })
      : [],
    prisma.fosterCheckIn.findMany({
      where: { profileId: v.profileId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { bird: { select: { name: true } } },
    }),
    prisma.fosterCheckIn.findFirst({
      where: { profileId: v.profileId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  // Compute soft nudge state: birds in care + N days since last check-in.
  // No SMS, no badge -- just a friendly inline banner. Threshold tunable.
  const NUDGE_AFTER_DAYS = Number(process.env.CHECKIN_NUDGE_AFTER_DAYS ?? 3);
  const now = Date.now();
  const lastMs = lastCheckIn?.createdAt.getTime();
  const daysSince = lastMs ? Math.floor((now - lastMs) / (24 * 60 * 60 * 1000)) : Infinity;
  const showNudge = birds.length > 0 && daysSince >= NUDGE_AFTER_DAYS;
  const nudgeText = !lastMs
    ? `You've got ${birds.length} bird${birds.length === 1 ? '' : 's'} in your care — first check-in earns a point.`
    : `${daysSince} days since your last check-in. Take a few seconds below — stable updates are still appreciated.`;

  return (
    <div className="space-y-4">
      {sp.msg === 'checked_in' && (
        <div className="rounded-xl ring-1 bg-emerald-50 ring-emerald-200 text-emerald-900 px-3 py-2 text-sm">
          ✅ Thanks for checking in. +1 point banked.
        </div>
      )}
      {sp.msg === 'forbidden' && (
        <div className="rounded-xl ring-1 bg-amber-50 ring-amber-200 text-amber-900 px-3 py-2 text-sm">
          ⚠️ That bird isn&apos;t in your care.
        </div>
      )}

      {showNudge && (
        <div className="rounded-xl ring-1 bg-sky-50 ring-sky-200 text-sky-900 px-3 py-2 text-sm">
          👋 {nudgeText}
        </div>
      )}

      {/* Quick check-in form */}
      <form action={submitCheckIn} className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5 space-y-3">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-600" /> Quick check-in
        </h2>
        <p className="text-xs text-gray-600">
          Optional — but every check-in earns +1 point. Use this even when nothing&apos;s wrong so we know things are stable.
        </p>

        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">How&apos;s it going?</legend>
          <div className="grid grid-cols-3 gap-2">
            {(['all_good', 'watching', 'concern'] as const).map(p => {
              const tone = PULSE_TONE[p];
              const Icon = tone.icon;
              return (
                <label key={p} className={`flex flex-col items-center gap-1 rounded-xl ring-1 px-2 py-3 cursor-pointer hover:bg-gray-50 has-[:checked]:bg-teal-50 has-[:checked]:ring-teal-400 has-[:checked]:ring-2 ${tone.ring}`}>
                  <input type="radio" name="pulse" value={p} defaultChecked={p === 'all_good'} className="sr-only" />
                  <Icon size={20} className={tone.bg.split(' ')[0].replace('bg-', 'text-')} />
                  <span className="text-xs font-medium">{PULSE_LABEL[p]}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {birds.length > 0 && (
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">For a specific bird (optional)</span>
            <select name="birdId" defaultValue="" className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
              <option value="">— General check-in (any bird) —</option>
              {birds.map(b => (
                <option key={b.id} value={b.id}>{b.name} {b.species ? `· ${b.species}` : ''}</option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Note (optional)</span>
          <textarea
            name="note"
            rows={2}
            placeholder="Anything to share? Leave blank if all's well."
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </label>

        <button type="submit" className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2">
          Check in (+1 pt)
        </button>
      </form>

      {/* Birds in care */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 px-1">
          Birds in your care ({birds.length})
        </h2>
        {birds.length === 0 ? (
          <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5 text-sm text-gray-600">
            No birds currently linked to your foster record. Christina assigns birds via the admin app.
          </div>
        ) : (
          <ul className="space-y-2">
            {birds.map(b => (
              <li key={b.id} className="rounded-xl bg-white shadow ring-1 ring-gray-200 p-3 flex items-center gap-3">
                <Bird size={18} className="text-gray-500" />
                <div className="flex-grow min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{b.name}</p>
                  <p className="text-xs text-gray-600">
                    {b.species ?? 'unspecified'} · {b.status}
                    {b.medicalPriority !== 'none' && ` · ${b.medicalPriority} priority`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent check-ins */}
      {recentCheckIns.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 px-1">
            Your recent check-ins
          </h2>
          <ul className="space-y-2">
            {recentCheckIns.map(c => (
              <li key={c.id} className="rounded-xl bg-white shadow ring-1 ring-gray-200 p-3 flex items-start gap-3">
                <div className={`flex-shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full ${PULSE_TONE[c.pulse].bg}`}>
                  {(() => { const I = PULSE_TONE[c.pulse].icon; return <I size={14} />; })()}
                </div>
                <div className="flex-grow min-w-0">
                  <p className="text-xs text-gray-700">
                    <span className="font-semibold">{PULSE_LABEL[c.pulse]}</span>
                    {c.bird?.name && <> · {c.bird.name}</>}
                    <span className="text-gray-400"> · {c.createdAt.toLocaleString()}</span>
                  </p>
                  {c.note && <p className="text-xs text-gray-600 mt-0.5">{c.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
