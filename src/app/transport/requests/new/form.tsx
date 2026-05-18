'use client';

// PR C: Client-side form for new multi-stop transport job.
//
// State shape:
//   - stops: array of { kind, location, timeStart, timeEnd, notes }, with
//     pickups and dropoffs kept in two visually-separate sections but
//     stored in a single sortOrder-preserving array. We split for render,
//     concat for submission.
//   - selectedBirds: Set of bird ids the user clicked into the chip area.
//
// The form serializes stops as a JSON string in a hidden input named
// "stops", and bird ids as a comma-separated string in "birdIds". The
// server action parses those.

import { useState, useMemo } from 'react';
import { Btn, Field, inputClass } from '@/components/ui';

type StopKind = 'pickup' | 'dropoff';

type StopDraft = {
  // Stable local id so React keys don't reshuffle when we filter/render.
  localId: string;
  kind: StopKind;
  location: string;
  timeStart: string; // datetime-local string, '' = blank
  timeEnd: string;
  notes: string;
};

type BirdOption = { id: string; name: string };
type VolunteerOption = { id: string; name: string };

function newDraft(kind: StopKind): StopDraft {
  return {
    localId: Math.random().toString(36).slice(2, 11),
    kind,
    location: '',
    timeStart: '',
    timeEnd: '',
    notes: '',
  };
}

export function NewTransportForm(props: {
  action: (formData: FormData) => void | Promise<void>;
  birds: BirdOption[];
  volunteers: VolunteerOption[];
  urgencies: string[];
  types: string[];
}) {
  const { action, birds, volunteers, urgencies, types } = props;
  const [stops, setStops] = useState<StopDraft[]>([]);
  const [selectedBirdIds, setSelectedBirdIds] = useState<string[]>([]);
  const [birdSearch, setBirdSearch] = useState('');

  const pickups = stops.filter((s) => s.kind === 'pickup');
  const dropoffs = stops.filter((s) => s.kind === 'dropoff');

  const filteredBirds = useMemo(() => {
    const q = birdSearch.trim().toLowerCase();
    const remaining = birds.filter((b) => !selectedBirdIds.includes(b.id));
    if (!q) return remaining;
    return remaining.filter((b) => b.name.toLowerCase().includes(q));
  }, [birds, selectedBirdIds, birdSearch]);

  function addStop(kind: StopKind) {
    setStops((prev) => [...prev, newDraft(kind)]);
  }
  function removeStop(localId: string) {
    setStops((prev) => prev.filter((s) => s.localId !== localId));
  }
  function updateStop(localId: string, patch: Partial<StopDraft>) {
    setStops((prev) => prev.map((s) => (s.localId === localId ? { ...s, ...patch } : s)));
  }
  function addBird(id: string) {
    setSelectedBirdIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setBirdSearch('');
  }
  function removeBird(id: string) {
    setSelectedBirdIds((prev) => prev.filter((x) => x !== id));
  }

  // Serialize stops for the hidden input. Times stay as ISO strings the
  // server can pass to new Date() — datetime-local outputs "2026-05-18T14:30"
  // which is local-time; we add ":00" if missing and let the server treat
  // it as the user's local timezone (same convention used by the legacy
  // single-stop form).
  const stopsJson = useMemo(
    () =>
      JSON.stringify(
        stops.map((s) => ({
          kind: s.kind,
          location: s.location.trim() || null,
          timeStart: s.timeStart ? s.timeStart : null,
          timeEnd: s.timeEnd ? s.timeEnd : null,
          notes: s.notes.trim() || null,
        })),
      ),
    [stops],
  );

  return (
    <form action={action} className="space-y-6">
      {/* Title + Type */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input
            name="title"
            placeholder='e.g. "Vet day — 5/22"'
            className={inputClass}
            maxLength={120}
          />
        </Field>
        <Field label="Type">
          <select name="type" defaultValue="" className={inputClass}>
            <option value="">— select —</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* PICKUPS */}
      <section className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
        <header className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold text-blue-900">📍 Pickups</h3>
          <button
            type="button"
            onClick={() => addStop('pickup')}
            className="text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline"
          >
            + Add a pickup
          </button>
        </header>
        {pickups.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No pickups yet — add one when you know.</p>
        ) : (
          <div className="space-y-3">
            {pickups.map((s) => (
              <StopRow
                key={s.localId}
                stop={s}
                onChange={(patch) => updateStop(s.localId, patch)}
                onRemove={() => removeStop(s.localId)}
                tone="blue"
              />
            ))}
          </div>
        )}
      </section>

      {/* DROP-OFFS */}
      <section className="rounded-lg border border-green-200 bg-green-50/40 p-3">
        <header className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold text-green-900">🏁 Drop-offs</h3>
          <button
            type="button"
            onClick={() => addStop('dropoff')}
            className="text-sm font-medium text-green-700 hover:text-green-900 hover:underline"
          >
            + Add a drop-off
          </button>
        </header>
        {dropoffs.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No drop-offs yet — add one when you know.</p>
        ) : (
          <div className="space-y-3">
            {dropoffs.map((s) => (
              <StopRow
                key={s.localId}
                stop={s}
                onChange={(patch) => updateStop(s.localId, patch)}
                onRemove={() => removeStop(s.localId)}
                tone="green"
              />
            ))}
          </div>
        )}
      </section>

      {/* BIRDS */}
      <section className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
        <header className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold text-amber-900">🐦 Birds in transport</h3>
          <span className="text-xs text-gray-500">
            {selectedBirdIds.length} selected
          </span>
        </header>
        {selectedBirdIds.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedBirdIds.map((id) => {
              const b = birds.find((x) => x.id === id);
              if (!b) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-sm text-amber-900"
                >
                  {b.name}
                  <button
                    type="button"
                    onClick={() => removeBird(id)}
                    className="font-bold leading-none hover:text-red-700"
                    aria-label={`Remove ${b.name}`}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <input
          type="text"
          placeholder="Type to find a bird…"
          value={birdSearch}
          onChange={(e) => setBirdSearch(e.target.value)}
          className={inputClass}
        />
        {birdSearch.trim() !== '' && filteredBirds.length > 0 && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded border border-gray-200 bg-white shadow-sm">
            {filteredBirds.slice(0, 12).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => addBird(b.id)}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-amber-50"
              >
                + {b.name}
              </button>
            ))}
          </div>
        )}
        {birdSearch.trim() !== '' && filteredBirds.length === 0 && (
          <p className="text-xs text-gray-500 mt-1">No matching birds.</p>
        )}
      </section>

      {/* META */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Urgency">
          <select name="urgency" defaultValue="normal" className={inputClass}>
            {urgencies.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assign driver (optional)">
          <select name="volunteerId" defaultValue="" className={inputClass}>
            <option value="">— leave open —</option>
            {volunteers.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description (what's the job?)" className="sm:col-span-2">
          <textarea name="description" rows={2} className={inputClass} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea
            name="notes"
            rows={3}
            className={inputClass}
            placeholder="Any other context — vet name, who organized, etc."
          />
        </Field>
      </div>

      {/* Hidden serialized fields */}
      <input type="hidden" name="stops" value={stopsJson} />
      <input type="hidden" name="birdIds" value={selectedBirdIds.join(',')} />

      <Btn type="submit" variant="primary">
        Save transport job
      </Btn>
    </form>
  );
}

function StopRow(props: {
  stop: StopDraft;
  onChange: (patch: Partial<StopDraft>) => void;
  onRemove: () => void;
  tone: 'blue' | 'green';
}) {
  const { stop, onChange, onRemove, tone } = props;
  const borderColor = tone === 'blue' ? 'border-blue-300' : 'border-green-300';
  return (
    <div className={`rounded-md border ${borderColor} bg-white p-3 space-y-2`}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Location">
          <input
            value={stop.location}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder='Address or label (e.g. "Vet on 12th")'
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2 items-end">
          <Field label="Start time">
            <input
              type="datetime-local"
              value={stop.timeStart}
              onChange={(e) => onChange({ timeStart: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="End (window)">
            <input
              type="datetime-local"
              value={stop.timeEnd}
              onChange={(e) => onChange({ timeEnd: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
      </div>
      <Field label="Notes for this stop">
        <input
          value={stop.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="optional"
          className={inputClass}
        />
      </Field>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          className="text-sm text-red-600 hover:text-red-800 hover:underline"
        >
          × Remove this {stop.kind}
        </button>
      </div>
    </div>
  );
}
