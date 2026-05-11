import { fmtDate } from '@/lib/utils';
import { Field, Btn, inputClass, Empty } from '@/components/ui';

export type WeightLogEntry = {
  id: string;
  grams: number;
  measuredAt: Date;
  notes: string | null;
};

type Props = {
  entries: WeightLogEntry[];
  addAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
};

/**
 * Server-rendered weight log: list of past readings (newest first) plus
 * a form to add a new one. Delete is a per-row form so we keep the same
 * "no client JS for CRUD" pattern the rest of the app uses.
 *
 * The latest entry's grams value is mirrored onto Bird.weightGrams by the
 * server action so existing dashboards / list views keep working.
 */
export function WeightLog({ entries, addAction, deleteAction }: Props) {
  const todayIso = new Date().toISOString().slice(0, 10);

  // Trend marker for the most recent entry (compared to the one before it).
  const trend = (idx: number): string | null => {
    if (idx >= entries.length - 1) return null;
    const cur = entries[idx].grams;
    const prev = entries[idx + 1].grams;
    const delta = cur - prev;
    if (Math.abs(delta) < 0.5) return '·';
    return delta > 0 ? `▲ +${delta.toFixed(1)}g` : `▼ ${delta.toFixed(1)}g`;
  };

  return (
    <div>
      {entries.length === 0 ? (
        <Empty msg="No weights logged yet." />
      ) : (
        <ul className="divide-y divide-gray-100 mt-2">
          {entries.map((w, i) => {
            const t = trend(i);
            return (
              <li key={w.id} className="py-2 flex items-center gap-3 text-sm">
                <div className="flex-1">
                  <div className="font-medium">{w.grams.toFixed(1)} g</div>
                  <div className="text-xs text-gray-500">
                    {fmtDate(w.measuredAt)}
                    {w.notes ? ` · ${w.notes}` : ''}
                  </div>
                </div>
                {t && (
                  <span
                    className={
                      'text-xs font-medium ' +
                      (t.startsWith('▲')
                        ? 'text-green-700'
                        : t.startsWith('▼')
                        ? 'text-orange-700'
                        : 'text-gray-400')
                    }
                  >
                    {t}
                  </span>
                )}
                <form action={deleteAction}>
                  <input type="hidden" name="id" value={w.id} />
                  <button
                    type="submit"
                    className="text-xs text-gray-400 hover:text-red-600"
                    aria-label="Delete weight entry"
                  >
                    ✕
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-teal-700">+ Log new weight</summary>
        <form action={addAction} className="grid gap-3 sm:grid-cols-3 mt-3">
          <Field label="Weight (g) *">
            <input
              type="number"
              step="0.1"
              required
              name="grams"
              className={inputClass}
              placeholder="e.g. 320.5"
            />
          </Field>
          <Field label="Date *">
            <input
              type="date"
              required
              name="measuredAt"
              defaultValue={todayIso}
              className={inputClass}
            />
          </Field>
          <Field label="Notes">
            <input
              name="notes"
              className={inputClass}
              placeholder="post-meal, weak, etc."
            />
          </Field>
          <div className="sm:col-span-3">
            <Btn type="submit" variant="primary">
              Add weight
            </Btn>
          </div>
        </form>
      </details>
    </div>
  );
}
