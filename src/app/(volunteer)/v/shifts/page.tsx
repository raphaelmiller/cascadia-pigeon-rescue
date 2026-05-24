// Volunteer Availability / Shift-claim page.
//
// PR H (2026-05-24) — rewrite.
//
// OLD model: pick KIND (one_time/weekly/indefinite/always/custom),
// pick SCOPE (any/rescue/transport/foster_oncall), set datetime, tick
// repeat checkboxes, optionally paste a raw RRULE. Confusing on phone,
// inverted the mental model.
//
// NEW model — three claim flows:
//   1. CLAIM A RESCUE SHIFT          → scope=rescue
//   2. CLAIM A TRANSPORT SHIFT       → scope=transport
//   3. CLAIM AVAILABILITY FOR BOTH   → scope=any
//
// Within each flow you pick a DAY (or a date RANGE), set one or more
// time WINDOWS on it, and tick "make this recurring" if you want it
// repeated weekly (or for N weeks). No more "kind" dropdown. No more
// "foster on-call" (not a real CPR thing). No more raw RRULE box on
// the primary form — power users can still paste one under "Advanced".

import { requireVolunteer } from '@/lib/volunteer/auth';
import { prisma } from '@/lib/prisma';
import { saveAvailability, deleteAvailability } from './actions';
import { fmtDate } from '@/lib/utils';
import { Trash2, Edit3, Plus, Siren, Truck, Calendar } from 'lucide-react';

export const dynamic = 'force-dynamic';

const SCOPE_LABELS: Record<string, { label: string; icon: typeof Siren; tone: string }> = {
  any:       { label: 'Both rescue & transport', icon: Calendar, tone: 'bg-teal-100 text-teal-800' },
  rescue:    { label: 'Rescue',                  icon: Siren,    tone: 'bg-red-100 text-red-800' },
  transport: { label: 'Transport',               icon: Truck,    tone: 'bg-blue-100 text-blue-800' },
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_CODES  = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function pad(n: number): string { return String(n).padStart(2, '0'); }
function toLocalDate(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toLocalTime(d: Date): string { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function fmtBlock(s: Date, e: Date, kind: string, rrule: string | null): string {
  if (kind === 'always') return '24/7 — always';
  const sameDay = s.toDateString() === e.toDateString();
  const t = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  let when: string;
  if (sameDay) {
    when = `${s.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${t(s)}–${t(e)}`;
  } else {
    when = `${fmtDate(s)} ${t(s)} → ${fmtDate(e)} ${t(e)}`;
  }
  if (rrule) {
    const dayMatch = rrule.match(/BYDAY=([A-Z,]+)/);
    if (dayMatch) {
      const days = dayMatch[1].split(',').map(d => {
        const i = DAY_CODES.indexOf(d);
        return i >= 0 ? DAY_LABELS[i] : d;
      }).join(', ');
      return `${when} · weekly on ${days}`;
    }
    return `${when} · recurring`;
  }
  return when;
}

export default async function VolunteerShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; edit?: string; scope?: string }>;
}) {
  const sp = await searchParams;
  const v = await requireVolunteer();
  const rows = await prisma.volunteerAvailability.findMany({
    where: { profileId: v.profileId },
    orderBy: { startsAt: 'asc' },
  });
  const editing = sp.edit ? rows.find(r => r.id === sp.edit) : null;

  // Default form values for "Add availability".
  const defaultStart = new Date();
  defaultStart.setMinutes(0, 0, 0);
  defaultStart.setHours(defaultStart.getHours() + 1);
  const defaultEnd = new Date(defaultStart.getTime() + 3 * 60 * 60 * 1000);

  // Pre-select the scope from the URL (so the three claim CTAs at the
  // top can deep-link into the right pre-selected form).
  const selectedScope = editing?.scope ?? sp.scope ?? 'any';

  // Active vs archived rows.
  const now = Date.now();
  const active = rows.filter(r => r.kind === 'always' || r.endsAt.getTime() >= now);
  const past = rows.filter(r => r.kind !== 'always' && r.endsAt.getTime() < now);

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
              ✅ Saved. ⚠️ Heads up: this overlaps {sp.msg.split(':')[1]} other block{sp.msg.split(':')[1] === '1' ? '' : 's'} of yours. That&apos;s OK if intentional.
            </>
          )}
          {sp.msg === 'deleted' && '🗑️ Deleted.'}
          {sp.msg === 'invalid_dates' && '⚠️ Start must be before end.'}
          {sp.msg === 'invalid_time' && '⚠️ End time must be after start time.'}
          {sp.msg === 'forbidden' && '⚠️ You can only edit your own availability.'}
        </div>
      )}

      <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5">
        <h1 className="text-xl font-semibold text-gray-900">My Availability</h1>
        <p className="text-sm text-gray-600 mt-1">
          When can you help? The dispatcher uses this to figure out who to text when a rescue or transport job comes in.
        </p>
      </div>

      {/* Three claim CTAs (deep-link to scope-preselected form) */}
      {!editing && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <a href="?scope=rescue#add" className="flex items-center gap-2 rounded-xl bg-white shadow ring-1 ring-red-200 hover:ring-red-300 p-3">
            <Siren size={20} className="text-red-600" />
            <span className="text-sm font-semibold text-gray-900">Claim a rescue shift</span>
          </a>
          <a href="?scope=transport#add" className="flex items-center gap-2 rounded-xl bg-white shadow ring-1 ring-blue-200 hover:ring-blue-300 p-3">
            <Truck size={20} className="text-blue-600" />
            <span className="text-sm font-semibold text-gray-900">Claim a transport shift</span>
          </a>
          <a href="?scope=any#add" className="flex items-center gap-2 rounded-xl bg-white shadow ring-1 ring-teal-200 hover:ring-teal-300 p-3">
            <Calendar size={20} className="text-teal-600" />
            <span className="text-sm font-semibold text-gray-900">Claim availability for both</span>
          </a>
        </div>
      )}

      {/* Add / edit form */}
      <form id="add" action={saveAvailability} className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5 space-y-4 scroll-mt-20">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          {editing ? <><Edit3 size={16} /> Edit availability</> : <><Plus size={16} /> Add availability</>}
        </h2>
        {editing && <input type="hidden" name="id" value={editing.id} />}

        {/* Scope: now a 3-button segmented control, no foster_oncall */}
        <fieldset>
          <legend className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">
            What kind of shift?
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {(['rescue', 'transport', 'any'] as const).map(s => {
              const cfg = SCOPE_LABELS[s];
              const Icon = cfg.icon;
              return (
                <label
                  key={s}
                  className="flex flex-col items-center gap-1 rounded-xl ring-1 ring-gray-300 px-2 py-3 cursor-pointer hover:bg-gray-50 has-[:checked]:bg-teal-50 has-[:checked]:ring-teal-400 has-[:checked]:ring-2"
                >
                  <input
                    type="radio"
                    name="scope"
                    value={s}
                    defaultChecked={selectedScope === s}
                    className="sr-only"
                  />
                  <Icon size={18} />
                  <span className="text-[11px] font-semibold text-gray-800 text-center">{cfg.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Date range — single day OR a stretch of days */}
        <fieldset className="space-y-2">
          <legend className="block text-xs font-semibold uppercase tracking-wide text-gray-700">
            What day(s)?
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 mb-1">Start date</span>
              <input
                type="date"
                name="startDate"
                required
                defaultValue={editing ? toLocalDate(editing.startsAt) : toLocalDate(defaultStart)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 mb-1">End date <span className="text-gray-400">(same as start = single day)</span></span>
              <input
                type="date"
                name="endDate"
                defaultValue={editing ? toLocalDate(editing.endsAt) : toLocalDate(defaultStart)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
        </fieldset>

        {/* Time window on each of those days */}
        <fieldset className="space-y-2">
          <legend className="block text-xs font-semibold uppercase tracking-wide text-gray-700">
            What hours each day?
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 mb-1">From</span>
              <input
                type="time"
                name="startTime"
                required
                defaultValue={editing ? toLocalTime(editing.startsAt) : toLocalTime(defaultStart)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 mb-1">To</span>
              <input
                type="time"
                name="endTime"
                required
                defaultValue={editing ? toLocalTime(editing.endsAt) : toLocalTime(defaultEnd)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
          <p className="text-[11px] text-gray-500">
            Window applies to every day in the date range. Need different times on different days? Save this one, then add another.
          </p>
        </fieldset>

        {/* Recurring toggle */}
        <fieldset className="rounded-lg ring-1 ring-gray-200 p-3 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="recurring"
              value="1"
              defaultChecked={Boolean(editing?.rrule)}
              className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm font-semibold text-gray-800">Make this recurring</span>
          </label>
          <div className="pl-6 space-y-2">
            <p className="text-[11px] text-gray-600">
              Repeats the window every week on the same weekday(s). Leave the days unchecked to use the weekday(s) of your date range.
            </p>
            <div className="flex flex-wrap gap-2">
              {DAY_CODES.map((d, i) => (
                <label key={d} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    name="byDays"
                    value={d}
                    defaultChecked={Boolean(editing?.rrule?.includes(d))}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  />
                  {DAY_LABELS[i]}
                </label>
              ))}
            </div>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-600 mb-1">Stop repeating after this date (optional)</span>
              <input
                type="date"
                name="effectiveUntil"
                defaultValue={editing?.effectiveUntil ? editing.effectiveUntil.toISOString().slice(0, 10) : ''}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
        </fieldset>

        <label className="block">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></span>
          <textarea
            name="notes"
            defaultValue={editing?.notes ?? ''}
            rows={2}
            placeholder='e.g. "Can do long-distance transport on weekends"'
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </label>

        {/* Advanced power-user RRULE — collapsed by default */}
        <details className="rounded-lg ring-1 ring-gray-200">
          <summary className="cursor-pointer text-xs font-medium text-gray-600 px-3 py-2 hover:bg-gray-50">
            Advanced — paste a custom recurrence rule (RRULE)
          </summary>
          <div className="p-3 border-t border-gray-200">
            <input
              type="text"
              name="customRrule"
              defaultValue={editing?.rrule ?? ''}
              placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono"
            />
            <p className="text-[11px] text-gray-500 mt-2">
              Overrides the recurring section above. Leave blank to use the form.
            </p>
          </div>
        </details>

        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2">
            {editing ? 'Save changes' : 'Save availability'}
          </button>
          {editing && (
            <a href="/shifts" className="rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 ring-1 ring-gray-300">
              Cancel
            </a>
          )}
        </div>
      </form>

      {/* List — active */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 px-1">
          Active availability ({active.length})
        </h2>
        {active.length === 0 ? (
          <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5 text-sm text-gray-600">
            Nothing set yet. Use one of the three buttons above to claim a shift.
          </div>
        ) : (
          <ul className="space-y-2">
            {active.map(r => (
              <AvailabilityRow key={r.id} row={r} />
            ))}
          </ul>
        )}
      </div>

      {/* List — past */}
      {past.length > 0 && (
        <details>
          <summary className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 px-1 cursor-pointer">
            Past blocks ({past.length})
          </summary>
          <ul className="space-y-2 mt-2">
            {past.map(r => (
              <AvailabilityRow key={r.id} row={r} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function AvailabilityRow({ row: r }: { row: {
  id: string;
  scope: string;
  kind: string;
  startsAt: Date;
  endsAt: Date;
  rrule: string | null;
  notes: string | null;
} }) {
  const cfg = SCOPE_LABELS[r.scope] ?? SCOPE_LABELS.any;
  const Icon = cfg.icon;
  return (
    <li className="rounded-xl bg-white shadow ring-1 ring-gray-200 p-3 flex items-start gap-3">
      <div className={`flex-shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full ${cfg.tone}`}>
        <Icon size={14} />
      </div>
      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${cfg.tone}`}>
            {cfg.label}
          </span>
        </div>
        <p className="text-sm text-gray-800 mt-1">{fmtBlock(r.startsAt, r.endsAt, r.kind, r.rrule)}</p>
        {r.notes && <p className="text-xs text-gray-600 mt-1">{r.notes}</p>}
      </div>
      <div className="flex-shrink-0 flex gap-1">
        <a href={`/shifts?edit=${r.id}#add`} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800">
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
  );
}
