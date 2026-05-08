import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, H2, Card, Pill, StatusDot, Btn, Empty } from '@/components/ui';
import { computeRunout, daysUntil, fmtDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function MedsPage() {
  const meds = await prisma.medication.findMany({
    include: { bird: true },
    orderBy: { startDate: 'desc' },
  });

  const enriched = meds.map(m => {
    const runout = computeRunout(m.startDate, m.daysSupplied, m.expectedRunOut);
    const days = runout ? daysUntil(runout) : null;
    const stopped = m.stopDate && m.stopDate < new Date();
    return { ...m, runout, days, stopped };
  });

  const due7 = enriched.filter(m => !m.stopped && !m.refillDelivered && m.runout && (m.days ?? 999) <= 7).sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
  const reassess = enriched.filter(m => !m.stopped && m.reassessDate && (daysUntil(m.reassessDate) ?? 999) <= 7);
  const active = enriched.filter(m => !m.stopped);

  return (
    <div className="space-y-4">
      <H1>Medications</H1>

      <Card tone={due7.length ? 'red' : 'gray'}>
        <H2>Refills due within 7 days</H2>
        {due7.length === 0 ? <Empty msg="No refills coming due." /> : (
          <ul className="divide-y divide-gray-100 mt-3">
            {due7.map(m => {
              const days = m.days as number;
              const tone = days <= 0 ? 'red' : days <= 3 ? 'orange' : 'yellow';
              return (
                <li key={m.id} className="py-2.5 flex items-center gap-3">
                  <StatusDot tone={tone} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {m.name} · <Link href={`/birds/${m.birdId}`} className="text-teal-700 hover:underline">{m.bird.name}</Link>
                    </div>
                    <div className="text-xs text-gray-500">runout {fmtDate(m.runout)} · {m.frequency || '—'}</div>
                  </div>
                  <Pill tone={tone}>{days <= 0 ? 'overdue' : `${days}d`}</Pill>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {reassess.length > 0 && (
        <Card tone="yellow">
          <H2>Reassessments due (≤7 days)</H2>
          <ul className="divide-y divide-gray-100 mt-3">
            {reassess.map(m => (
              <li key={m.id} className="py-2.5 flex items-center gap-3">
                <StatusDot tone="yellow" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{m.name} · <Link href={`/birds/${m.birdId}`} className="text-teal-700 hover:underline">{m.bird.name}</Link></div>
                  <div className="text-xs text-gray-500">reassess {fmtDate(m.reassessDate)}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <H2>All active medications</H2>
        {active.length === 0 ? <Empty msg="No active medications." /> : (
          <ul className="divide-y divide-gray-100 mt-3">
            {active.map(m => (
              <li key={m.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    {m.name} · <Link href={`/birds/${m.birdId}`} className="text-teal-700 hover:underline">{m.bird.name}</Link>
                  </div>
                  <span className="text-xs text-gray-500">{fmtDate(m.startDate)} →</span>
                </div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {m.dose ? `${m.dose} ` : ''}{m.route ? `· ${m.route} ` : ''}{m.frequency ? `· ${m.frequency} ` : ''}
                  {m.daysSupplied ? `· ${m.daysSupplied}d supply` : ''}
                  {m.runout ? ` · runout ${fmtDate(m.runout)}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gray-500 mt-3">Add a medication from a bird's detail page (Birds → bird → Medications → + Add).</p>
      </Card>
    </div>
  );
}
