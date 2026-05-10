import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { H1, H2, Card, Pill, Btn, Empty } from '@/components/ui';
import { fmtDateTime, daysUntil, isOverdue } from '@/lib/utils';
import {
  TRANSPORT_STATUS_TONE, URGENCY_TONE, SHIFT_TYPE_TONE,
} from '@/lib/constants';

export const dynamic = 'force-dynamic';

// =====================================================================
// Calendar focus detail — full-page drill-down for a summary tile.
// URL: /calendar/focus/[scope]/[bucket]
//   scope:  transport | rescue
//   bucket: pending | unassigned | in_transit | next7   (transport)
//           on_call | active | backup | open            (rescue)
// =====================================================================

const TRANSPORT_BUCKETS: Record<string, { title: string; subtitle: string; tone: string }> = {
  pending:     { title: 'Pending transports',       subtitle: 'Open requests awaiting action',           tone: 'orange' },
  unassigned:  { title: 'Unassigned transports',    subtitle: 'No driver assigned yet — needs a volunteer', tone: 'red' },
  in_transit:  { title: 'Transports in transit',    subtitle: 'Currently rolling',                        tone: 'blue' },
  next7:       { title: 'Transports — next 7 days', subtitle: 'Active pipeline for the next week',        tone: 'yellow' },
};

const RESCUE_BUCKETS: Record<string, { title: string; subtitle: string; tone: string }> = {
  on_call: { title: 'On-call shifts',          subtitle: 'Next 14 days · standby coverage',           tone: 'blue' },
  active:  { title: 'Active shifts',           subtitle: 'Next 14 days · confirmed active duty',     tone: 'green' },
  backup:  { title: 'Emergency backup shifts', subtitle: 'Next 14 days · second-line support',       tone: 'orange' },
  open:    { title: 'Open shifts',             subtitle: 'Next 14 days · uncovered, needs a rescuer', tone: 'red' },
};

export default async function FocusDetailPage({
  params,
}: {
  params: Promise<{ scope: string; bucket: string }>;
}) {
  const { scope, bucket } = await params;

  if (scope === 'transport') return <TransportFocus bucket={bucket} />;
  if (scope === 'rescue') return <RescueFocus bucket={bucket} />;
  notFound();
}

// ---------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------
async function TransportFocus({ bucket }: { bucket: string }) {
  const meta = TRANSPORT_BUCKETS[bucket];
  if (!meta) notFound();

  const allActive = await prisma.transportRequest.findMany({
    where: { status: { in: ['open', 'assigned', 'in_transit'] } },
    include: { volunteer: true, bird: { select: { id: true, name: true } } },
    orderBy: { pickupBy: 'asc' },
  });

  let items = allActive;
  if (bucket === 'pending')      items = allActive.filter(t => t.status === 'open');
  else if (bucket === 'unassigned') items = allActive.filter(t => !t.volunteerId);
  else if (bucket === 'in_transit') items = allActive.filter(t => t.status === 'in_transit');
  else if (bucket === 'next7')   items = allActive.filter(t => (daysUntil(t.pickupBy) ?? 99) <= 7);

  return (
    <div className="space-y-4">
      <Breadcrumbs scope="transport" />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <H1>{meta.title}</H1>
          <p className="text-sm text-gray-600 mt-1">{meta.subtitle}</p>
        </div>
        <Pill tone={meta.tone}>{items.length} item{items.length !== 1 ? 's' : ''}</Pill>
      </div>

      <Card tone={items.length ? meta.tone : 'gray'}>
        {items.length === 0 ? (
          <Empty msg="Nothing in this bucket. Nice work." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map(t => {
              const overdue = !['delivered', 'cancelled'].includes(t.status) && isOverdue(t.pickupBy);
              const days = daysUntil(t.pickupBy);
              return (
                <li key={t.id} className="py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Pill tone={URGENCY_TONE[t.urgency] || 'gray'}>{t.urgency}</Pill>
                    <Pill tone={TRANSPORT_STATUS_TONE[t.status] || 'gray'}>{t.status.replace('_', ' ')}</Pill>
                    {!t.volunteerId && <Pill tone="red">UNASSIGNED</Pill>}
                    {overdue && <Pill tone="red">overdue</Pill>}
                    <span className="text-xs text-gray-500 ml-auto">
                      {fmtDateTime(t.pickupBy)}
                      {typeof days === 'number' && (
                        <span className="ml-1 text-gray-400">
                          ({days === 0 ? 'today' : days === 1 ? 'tomorrow' : days < 0 ? `${-days}d ago` : `in ${days}d`})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm">
                    <strong>{t.fromAddress}</strong> → <strong>{t.toAddress}</strong>
                  </div>
                  {t.description && <p className="text-sm text-gray-600 mt-0.5">{t.description}</p>}
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                    {t.volunteer && (
                      <span>
                        Driver: <strong className="text-gray-700">{t.volunteer.name}</strong>
                        {t.volunteer.phone ? ` · ${t.volunteer.phone}` : ''}
                      </span>
                    )}
                    {t.bird && (
                      <Link href={`/birds/${t.bird.id}`} className="text-teal-700 hover:underline">
                        🕊️ {t.bird.name}
                      </Link>
                    )}
                    <Link href={`/transport/requests/${t.id}`} className="text-teal-700 hover:underline ml-auto">
                      Open transport →
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="flex items-center gap-2">
        <Btn href="/calendar?tab=transport" variant="ghost">← Back to calendar</Btn>
        <Btn href="/transport" variant="ghost">Manage transports →</Btn>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Rescue
// ---------------------------------------------------------------------
async function RescueFocus({ bucket }: { bucket: string }) {
  const meta = RESCUE_BUCKETS[bucket];
  if (!meta) notFound();

  const today = new Date();
  const horizon = new Date(today.getTime() + 14 * 86400000);
  const next14 = await prisma.rescueShift.findMany({
    where: { startsAt: { lte: horizon }, endsAt: { gte: today } },
    include: { volunteer: true },
    orderBy: { startsAt: 'asc' },
  });

  let items = next14;
  if (bucket === 'on_call')      items = next14.filter(s => s.shiftType === 'on_call');
  else if (bucket === 'active')  items = next14.filter(s => s.shiftType === 'active');
  else if (bucket === 'backup')  items = next14.filter(s => s.shiftType === 'emergency_backup');
  else if (bucket === 'open')    items = next14.filter(s => !s.volunteerId);

  return (
    <div className="space-y-4">
      <Breadcrumbs scope="rescue" />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <H1>{meta.title}</H1>
          <p className="text-sm text-gray-600 mt-1">{meta.subtitle}</p>
        </div>
        <Pill tone={meta.tone}>{items.length} shift{items.length !== 1 ? 's' : ''}</Pill>
      </div>

      <Card tone={items.length ? meta.tone : 'gray'}>
        {items.length === 0 ? (
          <Empty msg="Nothing in this bucket. Nice work." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map(s => {
              const days = daysUntil(s.startsAt);
              return (
                <li key={s.id} className="py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Pill tone={SHIFT_TYPE_TONE[s.shiftType] || 'gray'}>{s.shiftType.replace('_', ' ')}</Pill>
                    {!s.volunteerId && <Pill tone="red">OPEN</Pill>}
                    <span className="text-xs text-gray-500 ml-auto">
                      {fmtDateTime(s.startsAt)} → {fmtDateTime(s.endsAt)}
                      {typeof days === 'number' && (
                        <span className="ml-1 text-gray-400">
                          ({days === 0 ? 'today' : days === 1 ? 'tomorrow' : days < 0 ? `${-days}d ago` : `in ${days}d`})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="text-sm mt-1.5">
                    {s.volunteer ? (
                      <>
                        <strong>{s.volunteer.name}</strong>
                        {s.volunteer.phone ? <span className="text-gray-500"> · {s.volunteer.phone}</span> : null}
                      </>
                    ) : (
                      <span className="text-orange-700 font-medium">UNASSIGNED — needs cover</span>
                    )}
                  </div>
                  {s.area && <div className="text-xs text-gray-600 mt-0.5">📍 {s.area}</div>}
                  {s.notes && <div className="text-xs text-gray-600 mt-0.5">{s.notes}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="flex items-center gap-2">
        <Btn href="/calendar?tab=rescue" variant="ghost">← Back to calendar</Btn>
        <Btn href="/rescue" variant="ghost">Manage shifts →</Btn>
      </div>
    </div>
  );
}

function Breadcrumbs({ scope }: { scope: 'transport' | 'rescue' }) {
  return (
    <nav className="text-xs text-gray-500 flex items-center gap-1.5">
      <Link href="/calendar" className="hover:text-teal-700">Calendar</Link>
      <span>›</span>
      <Link
        href={`/calendar?tab=${scope}`}
        className="hover:text-teal-700 capitalize"
      >
        {scope}
      </Link>
      <span>›</span>
      <span className="text-gray-700 font-medium">Detail</span>
    </nav>
  );
}
