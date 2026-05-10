import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, Card, Pill, StatusDot, Btn, Empty } from '@/components/ui';
import { STATUS_LABELS, STATUS_TONE, PRIORITY_TONE, BIRD_STATUSES } from '@/lib/constants';
import { fmtDate } from '@/lib/utils';
import { activeBirdWhere } from '@/lib/filters';
import { SwipeRow } from '@/components/SwipeRow';
import { getBirdsSnapshots } from '@/lib/birdSnapshot';

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
    include: {
      foster: true,
      photos: { where: { isProfile: true, kind: 'image' }, take: 1 },
    },
    orderBy: { intakeDate: 'desc' },
  });

  // Batch-fetch snapshots so each card can show upcoming + refills.
  const snapshots = await getBirdsSnapshots(birds.map(b => b.id));

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
          {birds.map(b => {
            const profile = b.photos[0]?.url ?? null;
            const snap = snapshots.get(b.id) ?? { upcoming: [], refills: [] };
            const overdueRefills = snap.refills.filter(r => r.daysUntil <= 0).length;
            return (
              <SwipeRow
                key={b.id}
                archiveUrl={`/api/birds/${b.id}/archive`}
                deleteUrl={`/api/birds/${b.id}/delete`}
                entityName={b.name}
                className="rounded-2xl"
              >
                <Link href={`/birds/${b.id}`} className="block">
                  <Card className="hover:shadow-md transition cursor-pointer h-full">
                    <div className="flex items-start gap-3">
                      {profile ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={profile} alt={b.name} className="h-14 w-14 rounded-xl object-cover ring-1 ring-gray-200 flex-shrink-0" />
                      ) : (
                        <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-sky-200 to-sky-400 text-white flex items-center justify-center text-xl flex-shrink-0">🕊️</div>
                      )}
                      <div className="min-w-0 flex-1">
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
                      </div>
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
                    {(snap.upcoming.length > 0 || snap.refills.length > 0) && (
                      <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <div className="flex items-center gap-1 text-gray-500 uppercase tracking-wide font-semibold">
                            📅 Upcoming
                            {snap.upcoming.length > 0 && <Pill tone="blue">{snap.upcoming.length}</Pill>}
                          </div>
                          {snap.upcoming.slice(0, 2).map(it => (
                            <div key={`${it.kind}_${it.id}`} className="truncate text-gray-700 mt-0.5">
                              <span className="text-gray-400">{fmtDate(it.when)}</span>{' '}
                              <span>{it.kind === 'transport' ? '🚚' : it.kind === 'vet' ? '⚕️' : '•'}</span>{' '}
                              <span className="truncate">{it.title}</span>
                            </div>
                          ))}
                          {snap.upcoming.length === 0 && <div className="text-gray-400 mt-0.5">none</div>}
                        </div>
                        <div>
                          <div className="flex items-center gap-1 text-gray-500 uppercase tracking-wide font-semibold">
                            💊 Refills
                            {snap.refills.length > 0 && (
                              <Pill tone={overdueRefills ? 'red' : 'yellow'}>{snap.refills.length}</Pill>
                            )}
                          </div>
                          {snap.refills.slice(0, 2).map(r => (
                            <div key={r.id} className="truncate text-gray-700 mt-0.5">
                              <span className={r.daysUntil <= 0 ? 'text-red-700 font-medium' : 'text-gray-400'}>
                                {r.daysUntil <= 0 ? `${-r.daysUntil}d overdue` : `in ${r.daysUntil}d`}
                              </span>{' '}
                              <span className="truncate">{r.name}</span>
                            </div>
                          ))}
                          {snap.refills.length === 0 && <div className="text-gray-400 mt-0.5">none</div>}
                        </div>
                      </div>
                    )}
                  </Card>
                </Link>
              </SwipeRow>
            );
          })}
        </div>
      )}
    </div>
  );
}
