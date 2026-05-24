// PR H (2026-05-24) — Volunteer-reported concerns feed.
//
// Lists every FosterCheckIn (pulse=watching|concern) + DailyUpdate
// (stressLevel >= 7) from the last week so coordinators can spot
// fosters quietly struggling.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireVolunteer } from '@/lib/volunteer/auth';
import { getRecentConcerns } from '@/lib/volunteer/concerns';
import { AlertTriangle, Eye, Flame } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PULSE_META: Record<string, { label: string; tone: string; Icon: typeof Eye }> = {
  watching:    { label: 'Watching',    tone: 'bg-yellow-100 text-yellow-900 ring-yellow-300', Icon: Eye },
  concern:     { label: 'Concern',     tone: 'bg-red-100 text-red-900 ring-red-300',          Icon: AlertTriangle },
  high_stress: { label: 'High stress', tone: 'bg-orange-100 text-orange-900 ring-orange-300', Icon: Flame },
};

export default async function VolunteerConcernsFeedPage() {
  const v = await requireVolunteer();
  if (!v.isCoordinator) redirect('/');

  const concerns = await getRecentConcerns(100);

  return (
    <div className="space-y-4">
      <Link href="/dispatch" className="text-sm text-teal-700 hover:underline">← Dispatch board</Link>

      <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5">
        <div className="flex items-center gap-3">
          <AlertTriangle size={22} className="text-amber-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Volunteer-reported concerns</h1>
            <p className="text-sm text-gray-600 mt-1">
              Check-ins flagged <strong>Watching</strong> or <strong>Have a concern</strong>, plus daily updates with high stress (≥ 7). Last 7 days.
            </p>
          </div>
        </div>
      </div>

      {concerns.length === 0 ? (
        <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5 text-sm text-gray-600">
          🌿 Nothing concerning in the last week. Fosters are okay.
        </div>
      ) : (
        <ul className="space-y-2">
          {concerns.map(c => {
            const meta = PULSE_META[c.pulse];
            const Icon = meta.Icon;
            return (
              <li key={c.id} className={`rounded-xl bg-white shadow ring-1 p-3 flex items-start gap-3 ${meta.tone.includes('red') ? 'ring-red-200' : meta.tone.includes('orange') ? 'ring-orange-200' : 'ring-yellow-200'}`}>
                <div className={`flex-shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full ring-1 ${meta.tone}`}>
                  <Icon size={14} />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ring-1 ${meta.tone}`}>
                      {meta.label}
                    </span>
                    {c.fosterName && (
                      <span className="text-sm font-semibold text-gray-900">{c.fosterName}</span>
                    )}
                    {c.birdName && (
                      <span className="text-xs text-gray-600">· {c.birdName}</span>
                    )}
                    {c.stressLevel != null && (
                      <span className="text-xs text-orange-700 font-semibold">stress {c.stressLevel}/10</span>
                    )}
                  </div>
                  {c.note && (
                    <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{c.note}</p>
                  )}
                  <p className="text-[11px] text-gray-500 mt-1">
                    {c.kind === 'checkin' ? 'Foster check-in' : 'Daily update'} · {c.createdAt.toLocaleString()}
                    {c.birdId && <> · <Link href={`/birds/${c.birdId}`} className="text-teal-700 hover:underline">view bird</Link></>}
                    {c.fosterId && <> · <Link href={`/fosters/${c.fosterId}`} className="text-teal-700 hover:underline">view foster</Link></>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
