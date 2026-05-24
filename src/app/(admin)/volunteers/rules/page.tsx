// Admin: point-rules configuration. List every rule grouped by
// category. Each row is an inline edit form (points, enabled,
// optional autoApproveMax override).

import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { H1, Card, Btn } from '@/components/ui';
import { CATEGORY_LABEL, CATEGORY_ORDER, type RuleCategory } from '@/lib/volunteer/rules-catalog';
import { updateRule, bulkToggleCategory } from './actions';

export const dynamic = 'force-dynamic';

export default async function PointRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireOperator();
  const sp = await searchParams;
  const rules = await prisma.pointRule.findMany({ orderBy: { kind: 'asc' } });

  const byCategory = new Map<string, typeof rules>();
  for (const r of rules) {
    const list = byCategory.get(r.category) ?? [];
    list.push(r);
    byCategory.set(r.category, list);
  }

  const enabledCount = rules.filter(r => r.enabled).length;

  return (
    <div className="space-y-4">
      <Link href="/volunteers" className="text-sm text-teal-700 hover:underline">← Volunteer list</Link>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <H1>Point rules</H1>
        <div className="text-xs text-gray-600">
          {enabledCount} of {rules.length} enabled
        </div>
      </div>

      {sp.msg && (
        <div className={`rounded-xl ring-1 px-3 py-2 text-sm ${
          sp.msg.startsWith('invalid') ? 'bg-amber-50 ring-amber-200 text-amber-900' : 'bg-emerald-50 ring-emerald-200 text-emerald-900'
        }`}>
          {sp.msg === 'saved' && '✅ Rule saved.'}
          {sp.msg === 'bulk_enabled' && '✅ Category enabled.'}
          {sp.msg === 'bulk_disabled' && '🔒 Category disabled.'}
          {sp.msg === 'invalid_points' && '⚠️ Points must be a whole number.'}
          {sp.msg === 'invalid_auto' && '⚠️ Auto-approve max must be a non-negative whole number.'}
        </div>
      )}

      {enabledCount === 0 && (
        <div className="rounded-xl ring-1 bg-sky-50 ring-sky-300 text-sky-900 px-3 py-3 text-sm">
          <p className="font-semibold">👋 This is the rules control panel — nothing&apos;s broken.</p>
          <p className="mt-1 text-sky-800">
            Every rule ships <strong>disabled</strong> with a <em>suggested</em> point value visible. Nothing awards points
            until you turn it on. That&apos;s intentional — the suggestions are starting points, not Christina&apos;s final word.
          </p>
          <p className="mt-1.5 text-sky-800">
            Workflow: tune the points field to what feels right (or accept the suggestion), then flip the <strong>Enabled</strong> checkbox.
            Use <strong>Enable all</strong> at the top of a category if you want to turn on a whole group at once.
          </p>
          <p className="mt-1.5 text-[12px] text-sky-700">
            Recommended: enable <code className="text-[11px] bg-sky-100 px-1 rounded">foster.check_in</code> first so volunteers
            see immediate feedback when they check in. Layer in rescue/transport resolution rules next once volunteers are using the portal.
          </p>
        </div>
      )}

      <Card>
        <p className="text-sm text-gray-700">
          Each rule maps to a recognized event kind in the volunteer portal. Disabled rules still log the event for audit, but award 0 points.
          When you enable a rule, future events of that kind will award the configured points.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          The global auto-approve threshold is <code>POINT_AUTO_APPROVE_MAX</code> (env). Set a per-rule override below to differ.
        </p>
      </Card>

      {CATEGORY_ORDER.map(cat => {
        const list = byCategory.get(cat) ?? [];
        if (list.length === 0) return null;
        const allOn = list.every(r => r.enabled);
        return (
          <Card key={cat}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-base font-semibold text-gray-900">
                {CATEGORY_LABEL[cat as RuleCategory]} <span className="text-xs font-normal text-gray-500">({list.length})</span>
              </h2>
              <form action={bulkToggleCategory}>
                <input type="hidden" name="category" value={cat} />
                <input type="hidden" name="enabled" value={allOn ? '0' : '1'} />
                <button type="submit" className="text-xs font-medium rounded-lg px-2.5 py-1 bg-white ring-1 ring-gray-300 hover:bg-gray-50">
                  {allOn ? 'Disable all' : 'Enable all'}
                </button>
              </form>
            </div>
            <ul className="divide-y divide-gray-100">
              {list.map(r => (
                <li key={r.kind} className="py-3">
                  <form action={updateRule} className="flex items-start gap-3 flex-wrap">
                    <input type="hidden" name="kind" value={r.kind} />
                    <div className="flex-grow min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{r.label}</p>
                      <p className="text-[11px] font-mono text-gray-500">{r.kind}</p>
                      {r.description && <p className="text-xs text-gray-600 mt-0.5">{r.description}</p>}
                      {!r.enabled && (
                        <span className="inline-block mt-1 text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 bg-gray-200 text-gray-700">
                          Disabled
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="block">
                        <span className="block text-[10px] uppercase tracking-wide text-gray-500">Points</span>
                        <input
                          type="number"
                          name="points"
                          defaultValue={r.points}
                          step={1}
                          className="w-16 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-right"
                        />
                        <span className="block text-[10px] text-gray-400 text-right">suggested {r.suggestedPoints}</span>
                      </label>
                      <label className="block">
                        <span className="block text-[10px] uppercase tracking-wide text-gray-500">Auto&le;</span>
                        <input
                          type="number"
                          name="autoApproveMax"
                          defaultValue={r.autoApproveMax ?? ''}
                          placeholder="env"
                          step={1}
                          min={0}
                          className="w-14 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-right"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-sm font-medium">
                        <input
                          type="checkbox"
                          name="enabled"
                          value="1"
                          defaultChecked={r.enabled}
                          className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                        Enabled
                      </label>
                      <button type="submit" className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-3 py-1.5">
                        Save
                      </button>
                    </div>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
