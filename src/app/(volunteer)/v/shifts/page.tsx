// Volunteer Availability + Shifts page.
//
// Phase 1 ships the AVAILABILITY half: volunteer manages their own
// availability blocks across the five kinds (one_time / weekly /
// indefinite / always / custom). Shifts list (their upcoming assigned
// shifts) is a follow-up; for now we surface upcoming assignments at
// the dashboard, and this page is purely "when am I free?"

import { requireVolunteer } from '@/lib/volunteer/auth';
import { prisma } from '@/lib/prisma';
import { saveAvailability, deleteAvailability } from './actions';
import { Trash2, Edit3, Plus } from 'lucide-react';

export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<string, string> = {
  one_time: 'One-time',
  weekly: 'Weekly',
  indefinite: 'Indefinite (recurring, no end)',
  always: '24/7',
  custom: 'Custom (RRULE)',
};

const SCOPE_LABELS: Record<string, string> = {
  any: 'Any',
  rescue: 'Rescue only',
  transport: 'Transport only',
  foster_oncall: 'Foster on-call',
};

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtRange(s: Date, e: Date, kind: string): string {
  if (kind === 'always') return '24/7';
  const sameDay = s.toDateString() === e.toDateString();
  const t = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) {
    return `${s.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${t(s)}–${t(e)}`;
  }
  return `${s.toLocaleDateString()} ${t(s)} → ${e.toLocaleDateString()} ${t(e)}`;
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export default async function VolunteerShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; edit?: string }>;
}) {
  const sp = await searchParams;
  const v = await requireVolunteer();
  const rows = await prisma.volunteerAvailability.findMany({
    where: { profileId: v.profileId },
    orderBy: { startsAt: 'asc' },
  });
  const editing = sp.edit ? rows.find(r => r.id === sp.edit) : null;
  const defaultStart = new Date();
  defaultStart.setMinutes(0, 0, 0);
  defaultStart.setHours(defaultStart.getHours() + 1);
  const defaultEnd = new Date(defaultStart.getTime() + 4 * 60 * 60 * 1000);

  return (
    <div className="space-y-4">
      {sp.msg && (
        <div className={`rounded-xl ring-1 px-3 py-2 text-sm ${
          sp.msg === 'saved' || sp.msg === 'deleted'
            ? 'bg-emerald-50 ring-emerald-200 text-emerald-900'
            : sp.msg.startsWith('saved_with_overlap')
            ? 'bg-yellow-50 ring-yellow-300 text-yellow-900'
            : 'bg-amber-50 ring-amber-200 text-amber-900'
        }`}>
          {sp.msg === 'saved' && '✅ Saved.'}
          {sp.msg.startsWith('saved_with_overlap:') && (
            <>
              ✅ Saved. ⚠️ Heads up: this block overlaps {sp.msg.split(':')[1]} other block{sp.msg.split(':')[1] === '1' ? '' : 's'} of yours. That’s OK if intentional.
            </>
          )}
          {sp.msg === 'deleted' && '🗑️ Deleted.'}
          {sp.msg === 'invalid_dates' && '⚠️ Start must be before end.'}
          {sp.msg === 'forbidden' && '⚠️ You can only edit your own availability.'}
        </div>
      )}

      <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5">
        <h1 className="text-xl font-semibold text-gray-900">My Availability</h1>
        <p className="text-sm text-gray-600 mt-1">
          When are you available? The dispatcher uses this to figure out who to text when a rescue or transport job comes in.
        </p>
      </div>

      {/* Add / edit form */}
      <form action={saveAvailability} className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5 space-y-3">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          {editing ? <><Edit3 size={16} /> Edit availability</> : <><Plus size={16} /> Add availability</>}
        </h2>
        {editing && <input type="hidden" name="id" value={editing.id} />}

        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Kind</span>
          <select name="kind" defaultValue={editing?.kind ?? 'weekly'} className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
            {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Scope</span>
          <select name="scope" defaultValue={editing?.scope ?? 'any'} className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
            {Object.entries(SCOPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <span className="text-[11px] text-gray-500 mt-1 block">
            Narrow this block to a job type (e.g. only transport on weeknights).
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Starts</span>
            <input
              type="datetime-local"
              name="startsAt"
              defaultValue={editing ? toLocalInput(editing.startsAt) : toLocalInput(defaultStart)}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Ends</span>
            <input
              type="datetime-local"
              name="endsAt"
              defaultValue={editing ? toLocalInput(editing.endsAt) : toLocalInput(defaultEnd)}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>

        <fieldset className="rounded-lg border border-gray-200 p-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-700 px-1">Repeat on (weekly/indefinite only)</legend>
          <div className="flex flex-wrap gap-3 mt-1">
            {DAYS.map(d => (
              <label key={d} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  name="byDays"
                  value={d}
                  className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                {d}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            Leave blank to use the weekday of the start date.
          </p>
        </fieldset>

        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Until (optional)</span>
          <input
            type="date"
            name="effectiveUntil"
            defaultValue={editing?.effectiveUntil ? editing.effectiveUntil.toISOString().slice(0, 10) : ''}
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
          <span className="text-[11px] text-gray-500 mt-1 block">
            For weekly blocks that should only run for a few weeks. Leave blank for indefinite.
          </span>
        </label>

        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Custom RRULE (advanced)</span>
          <input
            type="text"
            name="customRrule"
            defaultValue={editing?.rrule ?? ''}
            placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Notes</span>
          <textarea
            name="notes"
            defaultValue={editing?.notes ?? ''}
            rows={2}
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </label>

        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2">
            {editing ? 'Save changes' : 'Add availability'}
          </button>
          {editing && (
            <a href="/shifts" className="rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 ring-1 ring-gray-300">
              Cancel
            </a>
          )}
        </div>
      </form>

      {/* List */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 px-1">
          Your availability ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5 text-sm text-gray-600">
            Nothing set yet. Add your first block above.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map(r => (
              <li key={r.id} className="rounded-xl bg-white shadow ring-1 ring-gray-200 p-3 flex items-start gap-3">
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-teal-100 text-teal-800">
                      {KIND_LABELS[r.kind]}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 bg-gray-100 text-gray-700">
                      {SCOPE_LABELS[r.scope]}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 mt-1">{fmtRange(r.startsAt, r.endsAt, r.kind)}</p>
                  {r.rrule && r.kind !== 'always' && (
                    <p className="text-[11px] text-gray-500 font-mono mt-0.5">{r.rrule}</p>
                  )}
                  {r.notes && <p className="text-xs text-gray-600 mt-1">{r.notes}</p>}
                </div>
                <div className="flex-shrink-0 flex gap-1">
                  <a
                    href={`/shifts?edit=${r.id}`}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                  >
                    <Edit3 size={16} />
                  </a>
                  <form action={deleteAvailability}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700">
                      <Trash2 size={16} />
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
