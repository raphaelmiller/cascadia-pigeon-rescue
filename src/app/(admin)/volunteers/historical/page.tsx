// Admin: central "historical contributions" page.
//
// Christina feedback (2026-05-25): "Might be easiest to send them all
// a template to write in how many birds they've rescued, how many
// drives they've done approximately, how many times they've helped
// coordinate, etc, and then put it in myself in a 'historical points'
// section or something? It's okay to launch without having the
// historical points in place — I want them in place asap but don't
// let it interfere with launching."
//
// One form per submission: select volunteer → pick category → enter
// count → optional date range + note → submit. Creates a single
// VolunteerEvent row with category='historical', kind matching the
// chosen historical.*_count PointRule, and pointDelta = count × rule.points.
//
// Per-volunteer drilldown still lives at /volunteers/[id]/seed for the
// existing flat-grant historical kinds (years_of_service, foster_career,
// fundraising, public_outreach, major_contribution, adjustment).
// This page focuses on the COUNT-BASED kinds Christina specifically
// asked for: rescues, transport drives, coordination, fostering.

import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { H1, Card, Btn } from '@/components/ui';
import { fmtDateTime } from '@/lib/utils';
import { grantHistoricalContribution } from './actions';

export const dynamic = 'force-dynamic';

const COUNT_KINDS = [
  { kind: 'historical.rescues_count',           label: 'Rescues',          unit: 'bird'  },
  { kind: 'historical.transport_drives_count',  label: 'Transport drives', unit: 'drive' },
  { kind: 'historical.coordination_count',      label: 'Coordination',     unit: 'shift' },
  { kind: 'historical.foster_count',            label: 'Fostering',        unit: 'bird placed' },
] as const;

export default async function HistoricalContributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; volunteerId?: string }>;
}) {
  await requireOperator();
  const sp = await searchParams;

  const [profiles, rules, recentGrants] = await Promise.all([
    prisma.volunteerProfile.findMany({
      where: { disabledAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
    }),
    prisma.pointRule.findMany({
      where: { kind: { in: COUNT_KINDS.map(k => k.kind) } },
      select: { kind: true, points: true, enabled: true, label: true },
    }),
    prisma.volunteerEvent.findMany({
      where: {
        category: 'historical',
        kind: { in: COUNT_KINDS.map(k => k.kind) },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { profile: { select: { id: true, name: true } } },
    }),
  ]);

  const ruleByKind = new Map(rules.map(r => [r.kind, r]));

  // Per-volunteer historical totals (count-kinds only) for a quick
  // "who's been backfilled, who hasn't" snapshot.
  const totalsByProfile = await prisma.volunteerEvent.groupBy({
    by: ['profileId'],
    where: {
      category: 'historical',
      kind: { in: COUNT_KINDS.map(k => k.kind) },
    },
    _sum: { pointDelta: true },
    _count: { _all: true },
  });
  const totalByProfile = new Map(
    totalsByProfile.map(t => [t.profileId, { points: t._sum.pointDelta ?? 0, count: t._count._all }]),
  );

  return (
    <div className="space-y-4">
      <Link href="/volunteers" className="text-sm text-teal-700 hover:underline">← Volunteers</Link>
      <H1>Historical contributions</H1>

      {sp.msg === 'granted' && (
        <div className="rounded-xl ring-1 px-3 py-2 text-sm bg-emerald-50 ring-emerald-200 text-emerald-900">
          ✅ Historical points granted.
        </div>
      )}
      {sp.msg === 'invalid' && (
        <div className="rounded-xl ring-1 px-3 py-2 text-sm bg-amber-50 ring-amber-200 text-amber-900">
          ⚠️ Pick a volunteer, a category, and a count above 0.
        </div>
      )}
      {sp.msg === 'rule_missing' && (
        <div className="rounded-xl ring-1 px-3 py-2 text-sm bg-amber-50 ring-amber-200 text-amber-900">
          ⚠️ Point rule not found for that category. Run the rules seed.
        </div>
      )}
      {sp.msg === 'rule_disabled' && (
        <div className="rounded-xl ring-1 px-3 py-2 text-sm bg-amber-50 ring-amber-200 text-amber-900">
          ⚠️ That rule is disabled. Enable it on the <Link href="/volunteers/rules" className="underline">Rules</Link> page first.
        </div>
      )}

      <Card>
        <p className="text-sm text-gray-700">
          Backfill points for work done <strong>before the portal existed</strong>.
          Pick a volunteer, pick what they did, enter how many, hit submit.
        </p>
        <p className="text-xs text-gray-600 mt-2">
          Per-unit point values come from the <Link href="/volunteers/rules" className="text-teal-700 hover:underline">Rules</Link> page
          (category: 🏆 Historical). For one-off grants like &quot;years of service&quot; or &quot;manual adjustment&quot;,
          use the per-volunteer <em>Seed historical points</em> button instead.
        </p>
      </Card>

      {/* Grant form */}
      <Card>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Grant historical points</h2>
        <form action={grantHistoricalContribution} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label>
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Volunteer</span>
              <select
                name="profileId"
                required
                defaultValue={sp.volunteerId ?? ''}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">— Select volunteer —</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.email ? ` (${p.email})` : ''}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Category</span>
              <select
                name="kind"
                required
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {COUNT_KINDS.map(k => {
                  const rule = ruleByKind.get(k.kind);
                  const pts = rule?.points ?? 0;
                  const status = !rule ? ' [missing rule]' : !rule.enabled ? ' [disabled]' : '';
                  return (
                    <option key={k.kind} value={k.kind}>
                      {k.label} · {pts} pt{pts === 1 ? '' : 's'}/{k.unit}{status}
                    </option>
                  );
                })}
              </select>
            </label>

            <label>
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">
                Count
              </span>
              <input
                type="number"
                name="count"
                min={1}
                step={1}
                required
                placeholder="e.g. 30"
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Date range — start (optional)</span>
                <input
                  type="date"
                  name="rangeStart"
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label>
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">end (optional)</span>
                <input
                  type="date"
                  name="rangeEnd"
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Note (optional)</span>
            <textarea
              name="note"
              rows={2}
              maxLength={500}
              placeholder="Context for the audit log, e.g. 'Self-reported via 2026-05 email.'"
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </label>

          <div className="flex gap-2 items-center">
            <Btn type="submit" variant="primary">Grant points</Btn>
            <span className="text-[11px] text-gray-500">
              One <code className="text-[10px]">VolunteerEvent</code> row · approvalStatus=&quot;approved&quot; (you ARE the review)
            </span>
          </div>
        </form>
      </Card>

      {/* Per-volunteer snapshot */}
      <Card>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Backfill status</h2>
        <p className="text-xs text-gray-600 mb-3">
          Per-volunteer historical totals from the four count-based categories above.
        </p>
        <ul className="divide-y divide-gray-100">
          {profiles.map(p => {
            const t = totalByProfile.get(p.id);
            return (
              <li key={p.id} className="py-2 flex items-center gap-3 text-sm">
                <span className="flex-grow truncate text-gray-800">{p.name}</span>
                {t ? (
                  <span className="text-xs text-gray-700">
                    <strong className="text-emerald-700">{t.points} pts</strong> · {t.count} grant{t.count === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 italic">no historical entries yet</span>
                )}
                <Link href={`/volunteers/historical?volunteerId=${p.id}#`} className="text-xs text-teal-700 hover:underline">
                  Grant →
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Recent grants log */}
      <Card>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Recent grants (last 25)</h2>
        {recentGrants.length === 0 ? (
          <p className="text-sm text-gray-600">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentGrants.map(e => {
              const meta = parseHistoricalMeta(e.notes);
              return (
                <li key={e.id} className="py-2 text-xs">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-gray-500">{fmtDateTime(e.createdAt)}</span>
                    <Link href={`/volunteers/${e.profile.id}`} className="font-semibold text-teal-700 hover:underline">
                      {e.profile.name}
                    </Link>
                    <span className="text-gray-700">·</span>
                    <span className="text-gray-700">{labelForKind(e.kind)}</span>
                    {meta?.count !== undefined && (
                      <span className="text-gray-600">× {meta.count}</span>
                    )}
                    <span className="ml-auto font-semibold text-emerald-700">+{e.pointDelta} pts</span>
                  </div>
                  {(meta?.range || meta?.note) && (
                    <p className="text-gray-600 mt-0.5">
                      {meta.range && <span className="text-gray-500">{meta.range} · </span>}
                      {meta.note}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function labelForKind(kind: string): string {
  return COUNT_KINDS.find(k => k.kind === kind)?.label ?? kind;
}

// Notes field format (set in actions.ts):
//   "count=N | range=YYYY-MM-DD..YYYY-MM-DD | <free text>"
// All parts optional except whatever the admin typed. We parse it back
// out for the recent-grants display.
function parseHistoricalMeta(notes: string | null): { count?: number; range?: string; note?: string } | null {
  if (!notes) return null;
  const out: { count?: number; range?: string; note?: string } = {};
  const parts = notes.split('|').map(p => p.trim());
  for (const part of parts) {
    if (part.startsWith('count=')) {
      const n = Number(part.slice(6));
      if (Number.isFinite(n)) out.count = n;
    } else if (part.startsWith('range=')) {
      out.range = part.slice(6);
    } else if (part) {
      out.note = part;
    }
  }
  return out;
}

