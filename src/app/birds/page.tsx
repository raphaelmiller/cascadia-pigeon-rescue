import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, Card, Pill, StatusDot, Btn, Empty } from '@/components/ui';
import { STATUS_LABELS, STATUS_TONE, PRIORITY_TONE, BIRD_STATUSES } from '@/lib/constants';
import { fmtDate } from '@/lib/utils';
import { activeBirdWhere } from '@/lib/filters';
import { SwipeRow } from '@/components/SwipeRow';

export const dynamic = 'force-dynamic';

export default async function BirdsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const where: Record<string, unknown> = { ...activeBirdWhere };
  if (params.status && BIRD_STATUSES.includes(params.status as never)) where.status = params.status;
  if (params.filter === 'critical') where.medicalPriority = { in: ['high', 'critical'] };
  if (params.filter === 'needs') where.status = { in: ['needs_intake', 'needs_foster', 'needs_transfer'] };
  if (params.q) {
    where.OR = [
      { name: { contains: params.q } },
      { species: { contains: params.q } },
      { primaryDiagnosis: { contains: params.q } },
    ];
  }

  const birds = await prisma.bird.findMany({
    where,
    include: { foster: true },
    orderBy: { intakeDate: 'desc' },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <H1>Birds</H1>
          <p className="text-sm text-gray-600 mt-1">{birds.length} total</p>
        </div>
        <Btn href="/birds/new" variant="primary">+ New intake</Btn>
      </div>

      <p className="text-xs text-gray-500 -mt-1">
        💡 <strong>Tip:</strong> swipe a card left (or drag with mouse) to archive or delete.
      </p>

      <Card>
        <form className="flex gap-2 flex-wrap">
          <input
            name="q"
            defaultValue={params.q || ''}
            placeholder="Search name, species, diagnosis…"
            className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
          />
          <select
            name="status"
            defaultValue={params.status || ''}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
          >
            <option value="">All statuses</option>
            {BIRD_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <Btn type="submit" variant="ghost">Apply</Btn>
        </form>
      </Card>

      {birds.length === 0 ? (
        <Empty msg="No birds match. Try different filters or +New intake." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {birds.map(b => (
            <SwipeRow
              key={b.id}
              archiveUrl={`/api/birds/${b.id}/archive`}
              deleteUrl={`/api/birds/${b.id}/delete`}
              entityName={b.name}
              className="rounded-2xl"
            >
              <Link href={`/birds/${b.id}`} className="block">
                <Card className="hover:shadow-md transition cursor-pointer h-full">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusDot tone={STATUS_TONE[b.status] || 'gray'} />
                        <h3 className="font-semibold truncate">{b.name}</h3>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{b.species || 'pigeon'} · {b.age || 'age unknown'}</p>
                    </div>
                    {b.medicalPriority !== 'none' && (
                      <Pill tone={PRIORITY_TONE[b.medicalPriority]}>{b.medicalPriority}</Pill>
                    )}
                  </div>
                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between text-gray-600">
                      <span>Status</span>
                      <span className="font-medium text-gray-800">{STATUS_LABELS[b.status]}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Foster</span>
                      <span className="font-medium text-gray-800 truncate">{b.foster?.name || '—'}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Intake</span>
                      <span className="font-medium text-gray-800">{fmtDate(b.intakeDate)}</span>
                    </div>
                    {b.primaryDiagnosis && (
                      <div className="text-gray-600 mt-1.5 line-clamp-2">{b.primaryDiagnosis}</div>
                    )}
                  </div>
                </Card>
              </Link>
            </SwipeRow>
          ))}
        </div>
      )}
    </div>
  );
}
