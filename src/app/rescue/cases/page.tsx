// PR D: Rescue Cases list page.
//
// Christina's flow: someone calls in a bird in trouble in the field
// (broken wing, can't fly, parking garage on 7th and Spring). She logs
// it as a RescueCase, attempts rescue, logs updates, and either rescues
// the bird (auto-creates a Bird record), watches it escape, or closes it.
//
// Top-level: status filter chips with live counts.
// Below: list of cases for the selected status, newest first.
// Above all: "+ Report new rescue case" CTA -> /rescue/cases/new.

import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, H2, Card, Pill, Btn, Empty } from '@/components/ui';
import { fmtDateTime, fmtRelative } from '@/lib/utils';
import { requireOperator } from '@/lib/auth';
import {
  RESCUE_CASE_STATUSES,
  RESCUE_CASE_STATUS_LABEL,
  RESCUE_CASE_STATUS_TONE,
} from '@/lib/constants';

export const dynamic = 'force-dynamic';

const activeCaseWhere = { archivedAt: null, deletedAt: null };

export default async function RescueCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireOperator();
  const params = await searchParams;
  const selectedStatus = (params.status && RESCUE_CASE_STATUSES.includes(params.status as (typeof RESCUE_CASE_STATUSES)[number]))
    ? (params.status as (typeof RESCUE_CASE_STATUSES)[number])
    : 'needs_rescue';

  const [counts, cases] = await Promise.all([
    prisma.rescueCase.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: activeCaseWhere,
    }),
    prisma.rescueCase.findMany({
      where: { ...activeCaseWhere, status: selectedStatus },
      include: {
        assignedVolunteer: true,
        rescuedBird: true,
        photos: { take: 1, orderBy: { createdAt: 'asc' } },
        _count: { select: { updates: true, photos: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const countByStatus: Record<string, number> = {};
  for (const c of counts) countByStatus[c.status] = c._count._all;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/rescue" className="text-sm text-teal-700 hover:underline">← Rescue</Link>
          <H1>Rescue cases</H1>
          <p className="text-sm text-gray-600 mt-1">
            Birds reported in the field that need rescue, in progress, or recently closed.
          </p>
        </div>
        <Btn href="/rescue/cases/new" variant="primary">+ Report new rescue case</Btn>
      </div>

      {/* Status filter chips */}
      <Card>
        <div className="flex flex-wrap gap-2">
          {RESCUE_CASE_STATUSES.map((s) => {
            const isSelected = s === selectedStatus;
            const n = countByStatus[s] || 0;
            const tone = RESCUE_CASE_STATUS_TONE[s] || 'gray';
            const baseClass = `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition`;
            const selectedClass = `bg-teal-600 text-white shadow-sm`;
            const unselectedClass = `bg-gray-100 text-gray-700 hover:bg-gray-200`;
            return (
              <Link
                key={s}
                href={`/rescue/cases?status=${s}`}
                className={`${baseClass} ${isSelected ? selectedClass : unselectedClass}`}
              >
                <Pill tone={tone}>{RESCUE_CASE_STATUS_LABEL[s] || s}</Pill>
                <span className="font-mono">{n}</span>
              </Link>
            );
          })}
        </div>
      </Card>

      {/* Cases list */}
      <Card>
        <H2>
          {RESCUE_CASE_STATUS_LABEL[selectedStatus] || selectedStatus}
          {' '}<span className="text-sm text-gray-500 font-normal">({cases.length})</span>
        </H2>
        {cases.length === 0 ? (
          <Empty msg={`No cases with status "${RESCUE_CASE_STATUS_LABEL[selectedStatus]}".`} />
        ) : (
          <ul className="divide-y divide-gray-100 mt-3">
            {cases.map((c) => {
              const headline = c.birdDescription || c.issue || 'Unidentified bird';
              return (
                <li key={c.id} className="py-3">
                  <Link href={`/rescue/cases/${c.id}`} className="block hover:bg-gray-50 -mx-3 px-3 rounded">
                    <div className="flex items-start gap-3 flex-wrap">
                      {c.photos[0]?.url && (
                        <div className="flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.photos[0].url} alt="" className="h-16 w-16 rounded object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Pill tone={RESCUE_CASE_STATUS_TONE[c.status] || 'gray'}>
                            {RESCUE_CASE_STATUS_LABEL[c.status] || c.status}
                          </Pill>
                          {c.assignedVolunteer && (
                            <span className="text-xs text-gray-600">
                              Rescuer: <strong>{c.assignedVolunteer.name}</strong>
                            </span>
                          )}
                          {c.rescuedBird && (
                            <span className="text-xs text-emerald-700">
                              → Bird: <strong>{c.rescuedBird.name}</strong>
                            </span>
                          )}
                          <span className="text-xs text-gray-400 ml-auto">{fmtRelative(c.createdAt)}</span>
                        </div>
                        <div className="mt-1 text-sm font-medium truncate">{headline}</div>
                        {c.issue && c.birdDescription && (
                          <div className="text-sm text-gray-700 truncate">{c.issue}</div>
                        )}
                        {c.location && (
                          <div className="text-xs text-gray-500 truncate">📍 {c.location}</div>
                        )}
                        <div className="mt-1 flex gap-3 text-xs text-gray-400">
                          {c._count.updates > 0 && <span>{c._count.updates} update{c._count.updates !== 1 ? 's' : ''}</span>}
                          {c._count.photos > 0 && <span>{c._count.photos} photo{c._count.photos !== 1 ? 's' : ''}</span>}
                          <span>Called in: {fmtDateTime(c.dateCalledIn)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
