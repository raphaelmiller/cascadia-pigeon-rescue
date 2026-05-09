import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, H2, Card, Pill, Btn, Empty } from '@/components/ui';
import { fmtRelative } from '@/lib/utils';
import { URGENCY_TONE, REQUEST_STATUSES } from '@/lib/constants';
import { activeBirdWhere, activeFosterWhere } from '@/lib/filters';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function setStatus(id: string, status: string) {
  'use server';
  await prisma.request.update({ where: { id }, data: { status } });
  redirect('/requests');
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const where: Record<string, unknown> = status ? { status } : { status: { in: ['open', 'in_progress'] } };
  const requests = await prisma.request.findMany({
    where: { ...where, foster: activeFosterWhere },
    include: { bird: true, foster: true },
    orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <H1>Requests</H1>
          <p className="text-sm text-gray-600 mt-1">{requests.length} requests · filter: {status || 'open + in_progress'}</p>
        </div>
        <Btn href="/requests/new" variant="primary">+ New request</Btn>
      </div>

      <Card>
        <div className="flex gap-2 flex-wrap text-xs">
          <Link href="/requests" className="underline">Active</Link>
          {REQUEST_STATUSES.map(s => (
            <Link key={s} href={`/requests?status=${s}`} className="underline text-gray-600">{s}</Link>
          ))}
        </div>
      </Card>

      {requests.length === 0 ? (
        <Empty msg="No requests in this view." />
      ) : (
        <div className="space-y-3">
          {requests.map(r => {
            const setStatusBound = setStatus.bind(null, r.id);
            return (
              <Card key={r.id} tone={URGENCY_TONE[r.urgency] || 'gray'}>
                <div className="flex items-start gap-2 flex-wrap">
                  <Pill tone={URGENCY_TONE[r.urgency] || 'gray'}>{r.urgency}</Pill>
                  <Pill>{r.type}</Pill>
                  <Pill tone={r.status === 'open' ? 'orange' : r.status === 'in_progress' ? 'yellow' : 'green'}>{r.status}</Pill>
                  <span className="text-xs text-gray-500 ml-auto">{fmtRelative(r.createdAt)}</span>
                </div>
                <p className="text-sm mt-2 whitespace-pre-wrap">{r.description}</p>
                <div className="mt-2 text-xs text-gray-600 flex gap-2 flex-wrap">
                  <span>From: <Link href={`/fosters/${r.foster.id}`} className="text-teal-700 hover:underline">{r.foster.name}</Link></span>
                  {r.bird && <span>· Bird: <Link href={`/birds/${r.bird.id}`} className="text-teal-700 hover:underline">{r.bird.name}</Link></span>}
                </div>
                <div className="mt-3 flex gap-2 flex-wrap">
                  {r.status !== 'in_progress' && (
                    <form action={async () => { 'use server'; await prisma.request.update({ where: { id: r.id }, data: { status: 'in_progress' } }); }}>
                      <Btn type="submit" variant="ghost">Mark in progress</Btn>
                    </form>
                  )}
                  {r.status !== 'resolved' && (
                    <form action={async () => { 'use server'; await prisma.request.update({ where: { id: r.id }, data: { status: 'resolved' } }); }}>
                      <Btn type="submit" variant="primary">Mark resolved</Btn>
                    </form>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
