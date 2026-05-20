'use client';

// =====================================================================
// ScheduleBlockModal — create / edit a block on the week view.
//
// One modal handles both flavours via the `kind` prop:
//   • 'availability' → start/end + recurrence + notes
//   • 'shift'        → start/end + recurrence + role + status + notes
//                      + assignee dropdown + warning surface
//
// Behaviour:
//   • Opens pre-filled (drag-to-create supplies startsAt/endsAt; clicking
//     an existing event supplies the row id + all fields).
//   • Recurrence row: preset buttons compile to RRULE on submit. A live
//     "Next: …, …, …" preview shows three concrete future occurrences.
//   • On save: posts a FormData to the parent-supplied server action.
//     The action returns either { ok: true } or { warnings: string[] }.
//     If warnings are returned, we surface them inline with an
//     "Assign anyway" button that re-posts with override=1.
//   • Edit-this-occurrence-only is deferred to Phase 2 — there's a small
//     hint in the modal explaining that edits apply to the whole series.
//   • The delete button is only shown in edit mode and confirms inline.
//
// This is a controlled client component used inside server-rendered pages;
// the parent decides when it's open by toggling `open`.
// =====================================================================

import { useEffect, useMemo, useState, useTransition } from 'react';
import { toLocalInputValue, RECURRENCE_PRESETS, type RecurrencePreset } from '@/lib/scheduling';

export type ModalAssignee = { id: string; name: string };

export type ScheduleModalState = {
  open: boolean;
  /** undefined = create mode, present = edit mode. */
  id?: string;
  startsAt?: Date;
  endsAt?: Date;
  rrule?: string | null;
  notes?: string | null;
  // shift-only:
  volunteerId?: string | null;
  role?: string | null;
  status?: string | null;
  isRecurringInstance?: boolean;
};

export type ScheduleModalProps = {
  kind: 'availability' | 'shift';
  /** Label for the assignee dropdown ("Driver" / "Rescuer" / "Volunteer"). */
  assigneeLabel?: string;
  /** Required for the 'shift' kind. Optional for availability (single-person pages). */
  assignees?: ModalAssignee[];
  /**
   * If the page is the "all volunteers" view, availability also needs an
   * assignee picker. If the page is a single-person view, the parent
   * locks the volunteer in via `lockedVolunteerId` so the field is
   * hidden + pre-set.
   */
  lockedVolunteerId?: string;
  /** Controlled open state + pre-filled values. Parent sets to {open:false} to close. */
  state: ScheduleModalState;
  /** Parent close handler. */
  onClose: () => void;
  /**
   * Submission callback. Parent calls into a server action and returns
   * its result. `override=true` means the user clicked "Save anyway"
   * after seeing the warnings.
   */
  onSubmit: (fd: FormData, override: boolean) => Promise<{ ok: boolean; warnings?: string[]; error?: string }>;
  /** Delete callback for edit mode. Returns when the delete is finished. */
  onDelete?: (id: string) => Promise<void>;
  /** Optional status options for the shift kind. */
  statusOptions?: readonly string[];
};

export function ScheduleBlockModal({
  kind,
  assigneeLabel = 'Volunteer',
  assignees = [],
  lockedVolunteerId,
  state,
  onClose,
  onSubmit,
  onDelete,
  statusOptions = ['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'],
}: ScheduleModalProps) {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [preset, setPreset] = useState<RecurrencePreset>('once');
  const [customRrule, setCustomRrule] = useState<string>('');
  const [start, setStart] = useState<string>('');
  const [end, setEnd] = useState<string>('');

  const isEdit = !!state.id;

  // Reset internal state when modal re-opens with new props.
  useEffect(() => {
    if (!state.open) return;
    setWarnings([]);
    setError(null);
    setStart(state.startsAt ? toLocalInputValue(state.startsAt) : '');
    setEnd(state.endsAt ? toLocalInputValue(state.endsAt) : '');
    if (!state.rrule) {
      setPreset('once');
      setCustomRrule('');
    } else {
      // Try to recognise our presets from the stored RRULE string so the
      // user lands on a sensible button. Anything else = 'custom'.
      const r = state.rrule.toUpperCase();
      if (r.includes('FREQ=DAILY')) setPreset('daily');
      else if (r.includes('FREQ=WEEKLY') && r.includes('BYDAY=MO,TU,WE,TH,FR')) setPreset('weekdays');
      else if (r.includes('FREQ=WEEKLY') && r.includes('INTERVAL=2')) setPreset('biweekly');
      else if (r.includes('FREQ=WEEKLY')) setPreset('weekly');
      else if (r.includes('FREQ=MONTHLY')) setPreset('monthly');
      else setPreset('custom');
      setCustomRrule(state.rrule);
    }
  }, [state.open, state.id, state.rrule, state.startsAt, state.endsAt]);

  // PR E (2026-05-18): early-return MOVED below the useMemo on line ~180.
  // It was here originally and caused React error #310 ("Rendered fewer
  // hooks than during the previous render") because the useMemo only ran
  // when the modal was open, so the hook count changed across renders.
  // Hooks must always be called in the same order — the early return
  // now lives right above the JSX, after every hook has executed.

  const submit = (override: boolean) => {
    setError(null);
    setWarnings([]);
    const fd = new FormData();
    if (state.id) fd.set('id', state.id);
    fd.set('startsAt', start);
    fd.set('endsAt', end);
    fd.set('preset', preset);
    if (preset === 'custom') fd.set('customRrule', customRrule);
    if (kind === 'shift') {
      fd.set('volunteerId', lockedVolunteerId ?? '');
      const formEl = document.getElementById('cpr-schedule-modal-form') as HTMLFormElement | null;
      if (formEl) {
        const data = new FormData(formEl);
        if (!lockedVolunteerId) fd.set('volunteerId', String(data.get('volunteerId') || ''));
        fd.set('role', String(data.get('role') || ''));
        fd.set('status', String(data.get('status') || 'scheduled'));
        fd.set('notes', String(data.get('notes') || ''));
      }
    } else {
      const formEl = document.getElementById('cpr-schedule-modal-form') as HTMLFormElement | null;
      if (formEl) {
        const data = new FormData(formEl);
        if (!lockedVolunteerId) fd.set('volunteerId', String(data.get('volunteerId') || ''));
        else fd.set('volunteerId', lockedVolunteerId);
        fd.set('notes', String(data.get('notes') || ''));
      }
    }
    if (override) fd.set('override', '1');

    startTransition(async () => {
      const res = await onSubmit(fd, override);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.warnings && res.warnings.length > 0 && !override) {
        // Show warnings as a non-blocking toast
        const overlappingItems = res.warnings.join(', ');
        alert(`Heads up: this overlaps with ${overlappingItems}`);
      }
      onClose();
    });
  };

  const handleDelete = () => {
    if (!state.id || !onDelete) return;
    if (!confirm('Delete this block? This cannot be undone.')) return;
    startTransition(async () => {
      await onDelete(state.id!);
      onClose();
    });
  };

  // Live preview of "next 3 occurrences" computed client-side from the
  // currently-selected preset + start input. Pure cosmetic — the server
  // re-computes from the persisted RRULE.
  const previewOccurrences = useMemo(() => {
    if (!start) return [];
    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) return [];
    if (preset === 'once') return [];
    // Cheap client-side preview — no rrule import needed; we mirror the
    // same intent as compilePreset(). For exotic 'custom' RRULEs we fall
    // back to "(custom recurrence)" and let the server render the truth.
    const out: Date[] = [];
    if (preset === 'daily') {
      for (let i = 0; i < 3; i++) out.push(addDays(startDate, i));
    } else if (preset === 'weekdays') {
      let d = new Date(startDate);
      while (out.length < 3) {
        const day = d.getDay();
        if (day >= 1 && day <= 5) out.push(new Date(d));
        d = addDays(d, 1);
      }
    } else if (preset === 'weekly') {
      for (let i = 0; i < 3; i++) out.push(addDays(startDate, i * 7));
    } else if (preset === 'biweekly') {
      for (let i = 0; i < 3; i++) out.push(addDays(startDate, i * 14));
    } else if (preset === 'monthly') {
      for (let i = 0; i < 3; i++) {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + i);
        out.push(d);
      }
    }
    return out;
  }, [preset, start]);

  // Now safe — all hooks above this line run on every render regardless
  // of `state.open`. See PR E note above.
  if (!state.open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-xl shadow-xl ring-1 ring-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">
            {isEdit ? 'Edit' : 'New'} {kind === 'availability' ? 'availability' : 'shift'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
            aria-label="Close"
          >×</button>
        </div>

        <form id="cpr-schedule-modal-form" className="p-4 space-y-3" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
          {isEdit && state.isRecurringInstance && (
            <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-900">
              <strong>Heads up:</strong> this is a recurring instance. Edits apply to the
              <strong> whole series</strong>. Per-occurrence overrides land in Phase 2.
            </div>
          )}

          {/* Assignee picker (shifts always; availability when not locked) */}
          {(kind === 'shift' || !lockedVolunteerId) && assignees.length > 0 && !lockedVolunteerId && (
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">
                {assigneeLabel}
              </span>
              <select
                name="volunteerId"
                defaultValue={state.volunteerId ?? ''}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">— {kind === 'shift' ? 'open / unassigned' : 'pick one —'} —</option>
                {assignees.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
          )}

          {/* Start / end */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Starts</span>
              <input
                type="datetime-local"
                name="startsAt"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Ends</span>
              <input
                type="datetime-local"
                name="endsAt"
                required
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>

          {/* Shift-only fields */}
          {kind === 'shift' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Role</span>
                <input
                  type="text"
                  name="role"
                  defaultValue={state.role ?? ''}
                  placeholder="Long-haul / Local / Pickup…"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Status</span>
                <select
                  name="status"
                  defaultValue={state.status ?? 'scheduled'}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {statusOptions.map(s => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* Recurrence row */}
          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Recurrence</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {RECURRENCE_PRESETS.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPreset(p.key)}
                  className={`text-xs rounded-md px-2 py-1.5 border transition ${
                    preset === p.key
                      ? 'bg-teal-600 text-white border-teal-700'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <label className="block mt-1">
                <span className="block text-[10px] font-semibold text-gray-700 mb-1 uppercase tracking-wide">
                  Custom RRULE
                </span>
                <input
                  type="text"
                  value={customRrule}
                  onChange={(e) => setCustomRrule(e.target.value)}
                  placeholder="FREQ=WEEKLY;BYDAY=TU,TH"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-mono"
                />
              </label>
            )}
            {previewOccurrences.length > 0 && (
              <div className="text-[11px] text-gray-500 mt-1">
                Next: {previewOccurrences.map(d => d.toLocaleDateString(undefined, {
                  weekday: 'short', month: 'short', day: 'numeric',
                })).join(' · ')}
              </div>
            )}
            {preset !== 'once' && previewOccurrences.length === 0 && preset === 'custom' && (
              <div className="text-[11px] text-gray-500 mt-1">
                (custom recurrence — server will expand on save)
              </div>
            )}
          </div>

          {/* Notes */}
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Notes</span>
            <textarea
              name="notes"
              rows={2}
              defaultValue={state.notes ?? ''}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </label>

          {/* PR G: Warnings are now non-blocking toasts, so no UI needed here */}

          {error && (
            <div className="rounded-lg bg-red-50 ring-1 ring-red-300 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
            <div>
              {isEdit && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={pending}
                  className="rounded-md bg-red-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-red-700"
                >
                  Delete
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-teal-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-teal-700 disabled:opacity-60"
              >
                {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Tiny local helper so we don't pull date-fns into the client bundle
// just for this preview. (next() additions only on days.)
function addDays(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}
