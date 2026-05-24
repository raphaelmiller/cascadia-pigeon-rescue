// Admin: bulk-seed historical points for one volunteer.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { H1, Card, Btn } from '@/components/ui';
import { seedHistoricalPoints } from './actions';

export const dynamic = 'force-dynamic';

const HISTORICAL_KINDS = [
  { kind: 'historical.years_of_service', label: 'Years of service', placeholder: '25 per year' },
  { kind: 'historical.major_contribution', label: 'Major contribution', placeholder: 'e.g. 50' },
  { kind: 'historical.foster_career', label: 'Past foster career', placeholder: 'e.g. 30' },
  { kind: 'historical.fundraising', label: 'Past fundraising', placeholder: 'e.g. 10' },
  { kind: 'historical.public_outreach', label: 'Past outreach / social media', placeholder: 'e.g. 10' },
  { kind: 'historical.adjustment', label: 'Manual adjustment (any reason)', placeholder: 'positive or negative' },
];

export default async function SeedHistoricalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireOperator();
  const { id } = await params;
  const sp = await searchParams;

  const profile = await prisma.volunteerProfile.findUnique({ where: { id } });
  if (!profile) notFound();

  // Get historical rules for context (suggested values).
  const rules = await prisma.pointRule.findMany({
    where: { category: 'historical' },
    select: { kind: true, suggestedPoints: true, label: true },
  });
  const ruleByKind = new Map(rules.map(r => [r.kind, r]));

  // Existing historical events to show what's already been granted.
  const existing = await prisma.volunteerEvent.findMany({
    where: { profileId: id, category: 'historical' },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const totalHistorical = existing.reduce((s, e) => s + e.pointDelta, 0);

  return (
    <div className="space-y-4">
      <Link href={`/volunteers/${id}`} className="text-sm text-teal-700 hover:underline">
        ← {profile.name}
      </Link>
      <H1>Seed historical points</H1>

      {sp.msg === 'no_grants' && (
        <div className="rounded-xl ring-1 bg-amber-50 ring-amber-200 text-amber-900 px-3 py-2 text-sm">
          ⚠️ Enter at least one point value before submitting.
        </div>
      )}

      <Card>
        <p className="text-sm text-gray-700">
          Use this to grant <strong>{profile.name}</strong> points for contributions before the portal existed. Each value gets a separate <code className="text-xs">VolunteerEvent</code> row tagged <code className="text-xs">approved</code> by you.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Tip: per Christina&apos;s workflow — paste the volunteer&apos;s self-described contribution summary below, then translate it into point values using the suggested defaults as a starting point.
        </p>
        {totalHistorical !== 0 && (
          <p className="text-xs text-gray-600 mt-2">
            Already granted: <strong>{totalHistorical} pts</strong> across {existing.length} historical events.
          </p>
        )}
      </Card>

      <Card>
        <form action={seedHistoricalPoints} className="space-y-3">
          <input type="hidden" name="profileId" value={id} />

          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">
              Volunteer&apos;s self-described contribution (optional)
            </span>
            <textarea
              name="summary"
              rows={4}
              placeholder="Paste their summary here for audit context. Will be attached to the first grant entry."
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </label>

          <div className="rounded-lg border border-gray-200 p-3 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Grants</h3>
            {HISTORICAL_KINDS.map(({ kind, label, placeholder }) => {
              const rule = ruleByKind.get(kind);
              return (
                <div key={kind} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_2fr] gap-2 items-end">
                  <div>
                    <span className="block text-xs font-medium text-gray-800">{label}</span>
                    <span className="block text-[10px] text-gray-500 font-mono">{kind}</span>
                    {rule && (
                      <span className="text-[10px] text-gray-400">suggested {rule.suggestedPoints} pts</span>
                    )}
                  </div>
                  <input
                    type="number"
                    name={`pts_${kind}`}
                    placeholder={placeholder}
                    step={1}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-right"
                  />
                  <input
                    type="text"
                    name={`note_${kind}`}
                    placeholder="Why? (optional, shows on the audit log)"
                    maxLength={200}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Btn type="submit" variant="primary">Grant points</Btn>
            <Btn href={`/volunteers/${id}`} variant="ghost">Cancel</Btn>
          </div>
        </form>
      </Card>

      {existing.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Previous historical grants</h2>
          <ul className="divide-y divide-gray-100">
            {existing.map(e => (
              <li key={e.id} className="py-2 text-xs flex items-start gap-3">
                <div className="flex-grow min-w-0">
                  <span className="font-mono text-gray-700">{e.kind}</span>
                  {e.notes && <p className="text-gray-600 mt-0.5">{e.notes}</p>}
                  <p className="text-[10px] text-gray-400">{e.createdAt.toLocaleString()}</p>
                </div>
                <span className="font-semibold text-emerald-700">+{e.pointDelta}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
