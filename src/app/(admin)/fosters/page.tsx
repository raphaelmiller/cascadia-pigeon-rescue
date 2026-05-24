import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, Card, Pill, StatusDot, Btn, Empty } from '@/components/ui';
import {
  stressLabel, stressTone,
  clinicalScore, qualityScore, clinicalCategory, qualityCategory,
} from '@/lib/constants';
import { activeFosterWhere } from '@/lib/filters';
import { SwipeRow } from '@/components/SwipeRow';

export const dynamic = 'force-dynamic';

export default async function FostersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const params = await searchParams;
  const fosters = await prisma.foster.findMany({
    where: activeFosterWhere,
    include: {
      _count: { select: { birds: { where: { archivedAt: null, deletedAt: null } } } },
      birds: { where: { archivedAt: null, deletedAt: null }, take: 5 },
    },
    orderBy: [{ currentStress: 'desc' }, { name: 'asc' }],
  });

  let filtered = fosters;
  if (params.q) {
    const q = params.q.toLowerCase();
    filtered = filtered.filter(f =>
      f.name.toLowerCase().includes(q) ||
      (f.address || '').toLowerCase().includes(q) ||
      (f.notes || '').toLowerCase().includes(q),
    );
  }
  if (params.filter === 'stress') {
    filtered = filtered.filter(f => ['orange', 'red'].includes(stressTone(f.currentStress)));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <H1>Fosters</H1>
          <p className="text-sm text-gray-600 mt-1">
            {filtered.length} of {fosters.length}
          </p>
        </div>
        <Btn href="/fosters/new" variant="primary">+ New foster</Btn>
      </div>

      <p className="text-xs text-gray-500 -mt-1">
        💡 <strong>Tip:</strong> swipe a card left (or drag with mouse) to archive or delete.
      </p>

      <Card>
        <form className="flex gap-2 flex-wrap">
          <input
            name="q"
            defaultValue={params.q || ''}
            placeholder="Search name / location / notes…"
            className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
          />
          <Btn type="submit" variant="ghost">Apply</Btn>
        </form>
        <div className="mt-2 flex gap-2 flex-wrap text-xs text-gray-600">
          <Link href="/fosters" className="underline">All</Link>
          <Link href="/fosters?filter=stress" className="underline text-red-700">High stress</Link>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Empty msg="No fosters match. + New foster to add one." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(f => {
            const tone = stressTone(f.currentStress);
            return (
              <SwipeRow
                key={f.id}
                archiveUrl={`/api/fosters/${f.id}/archive`}
                deleteUrl={`/api/fosters/${f.id}/delete`}
                entityName={f.name}
                className="rounded-2xl"
              >
                <Link href={`/fosters/${f.id}`} className="block">
                  <Card tone={tone} className="hover:shadow-md transition cursor-pointer h-full">
                    <div className="flex items-start gap-3">
                      {f.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.photoUrl} alt={f.name} className="h-12 w-12 rounded-full object-cover ring-1 ring-gray-200 flex-shrink-0" />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-teal-300 to-teal-500 text-white flex items-center justify-center text-base font-bold flex-shrink-0">
                          {f.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <StatusDot tone={tone} size="lg" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{f.name}</h3>
                        <p className="text-xs text-gray-500">{stressLabel(f.currentStress)} · {f.currentStress}/10</p>
                      </div>
                      <Pill>{f._count.birds}/{f.capacity || '—'}</Pill>
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-500">Care</span>
                        <span className="tabular-nums font-semibold text-gray-700">
                          {clinicalScore(f as unknown as Record<string, unknown>)}
                          <span className="text-gray-400 font-normal ml-1">{clinicalCategory(clinicalScore(f as unknown as Record<string, unknown>))}</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-500">Quality</span>
                        <span className="tabular-nums font-semibold text-gray-700">
                          {qualityScore(f as unknown as Record<string, unknown>)}
                          <span className="text-gray-400 font-normal ml-1">{qualityCategory(qualityScore(f as unknown as Record<string, unknown>))}</span>
                        </span>
                      </div>
                      {f.canTransportSelf && (
                        <div className="text-[10px] inline-flex items-center gap-1 text-sky-700 mt-0.5">
                          🚛 can transport birds
                        </div>
                      )}
                    </div>
                    {f.whiteboardNote && (
                      <div className="mt-3 rounded-lg bg-yellow-50 ring-1 ring-yellow-200 px-3 py-2 text-sm text-yellow-900">
                        📌 {f.whiteboardNote}
                      </div>
                    )}
                    {f.address && <p className="text-xs text-gray-500 mt-2 truncate">📍 {f.address}</p>}
                    {f.birds.length > 0 && (
                      <div className="mt-3 flex gap-1.5 flex-wrap">
                        {f.birds.map(b => (
                          <span key={b.id} className="text-xs rounded-md bg-gray-100 px-2 py-0.5">
                            🕊 {b.name}
                          </span>
                        ))}
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
