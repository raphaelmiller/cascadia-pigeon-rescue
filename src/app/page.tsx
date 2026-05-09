import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { computeRunout, daysUntil, fmtDate, fmtRelative } from '@/lib/utils';
import { Card, H1, H2, Pill, StatusDot, Empty, Btn } from '@/components/ui';
import { STATUS_LABELS, STATUS_TONE, PRIORITY_TONE, URGENCY_TONE, stressLabel, stressTone } from '@/lib/constants';
import { activeBirdWhere, activeFosterWhere } from '@/lib/filters';
import { AlertTriangle, Activity, Bird as BirdIcon, Home, Pill as PillIcon, Inbox, Calendar as CalendarIcon, Truck, Siren, Boxes } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 86400000);
  const [
    birds, fosters, openRequests, meds, upcomingEvents,
    transport, openShifts, lowStock, bandagesSoon,
  ] = await Promise.all([
    prisma.bird.findMany({ where: activeBirdWhere, include: { foster: true } }),
    prisma.foster.findMany({ where: activeFosterWhere }),
    prisma.request.findMany({
      where: { status: { in: ['open', 'in_progress'] } },
      include: { bird: true, foster: true },
      orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.medication.findMany({
      include: { bird: true },
      where: {
        OR: [{ stopDate: null }, { stopDate: { gt: now } }],
        bird: activeBirdWhere,
      },
    }),
    prisma.calendarEvent.findMany({
      where: { startsAt: { gte: now }, done: false },
      orderBy: { startsAt: 'asc' },
      take: 8,
      include: { bird: true },
    }),
    prisma.transportRequest.findMany({
      where: { status: { in: ['open', 'assigned', 'in_transit'] } },
      include: { volunteer: true },
    }),
    prisma.rescueShift.findMany({
      where: { startsAt: { lte: in7d }, endsAt: { gte: now }, volunteerId: null },
    }),
    prisma.supply.findMany({ where: { threshold: { gt: 0 } } }),
    prisma.bandageTask.findMany({
      where: { active: true, nextDueAt: { lte: in7d } },
      include: { bird: true },
      orderBy: { nextDueAt: 'asc' },
    }),
  ]);

  const needFoster = birds.filter(b => ['needs_intake', 'needs_foster', 'needs_transfer'].includes(b.status));
  const critical = birds.filter(b => ['high', 'critical'].includes(b.medicalPriority));

  const highStress = fosters
    .map(f => ({ ...f, _tone: stressTone(f.currentStress) }))
    .filter(f => ['orange', 'red'].includes(f._tone))
    .sort((a, b) => (b.currentStress ?? 0) - (a.currentStress ?? 0));

  const refillSoon = meds
    .map(m => {
      const runout = computeRunout(m.startDate, m.daysSupplied, m.expectedRunOut);
      const days = runout ? daysUntil(runout) : null;
      return { ...m, runout, days };
    })
    .filter(m => m.runout && m.days !== null && m.days <= 7 && !m.refillDelivered)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

  const urgent = openRequests.filter(r => r.urgency === 'urgent' || r.urgency === 'high');

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <H1>Rescue Command Center</H1>
          <p className="text-sm text-gray-600 mt-1">
            {fosters.length} fosters · {birds.length} birds · {openRequests.length} open requests
          </p>
        </div>
      </div>

      {/* Top urgents */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          tone={needFoster.length ? 'orange' : 'green'}
          icon={<BirdIcon size={18} />}
          label="Birds needing placement"
          value={needFoster.length}
          href="/birds?filter=needs"
        />
        <KpiCard
          tone={critical.length ? 'red' : 'green'}
          icon={<Activity size={18} />}
          label="Critical / high medical"
          value={critical.length}
          href="/birds?filter=critical"
        />
        <KpiCard
          tone={highStress.length ? 'orange' : 'green'}
          icon={<Home size={18} />}
          label="High-stress fosters"
          value={highStress.length}
          href="/fosters?filter=stress"
        />
        <KpiCard
          tone={refillSoon.length ? 'red' : 'green'}
          icon={<PillIcon size={18} />}
          label="Refills due ≤7d"
          value={refillSoon.length}
          href="/medications"
        />
      </div>

      {/* Phase 2 KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          tone={transport.filter(t => !t.volunteerId).length ? 'orange' : 'green'}
          icon={<Truck size={18} />}
          label="Transport — active"
          value={transport.length}
          href="/transport/calendar"
        />
        <KpiCard
          tone={openShifts.length ? 'orange' : 'green'}
          icon={<Siren size={18} />}
          label="Open rescue shifts (7d)"
          value={openShifts.length}
          href="/rescue/calendar"
        />
        <KpiCard
          tone={bandagesSoon.length ? 'yellow' : 'green'}
          icon={<Activity size={18} />}
          label="Bandages due ≤7d"
          value={bandagesSoon.length}
          href="/bandages"
        />
        <KpiCard
          tone={lowStock.filter(s => s.onHand <= s.threshold).length ? 'red' : 'green'}
          icon={<Boxes size={18} />}
          label="Supplies low"
          value={lowStock.filter(s => s.onHand <= s.threshold).length}
          href="/supplies"
        />
      </div>

      {/* Urgent requests */}
      <Card tone={urgent.length ? 'red' : 'gray'}>
        <div className="flex items-center justify-between mb-3">
          <H2>Urgent foster requests</H2>
          <Btn href="/requests" variant="ghost">View all</Btn>
        </div>
        {urgent.length === 0 ? (
          <Empty msg="No urgent or high-priority requests open." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {urgent.slice(0, 6).map(r => (
              <li key={r.id} className="py-3 flex items-start gap-3">
                <AlertTriangle className="mt-0.5 text-red-500" size={18} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Pill tone={URGENCY_TONE[r.urgency] || 'gray'}>{r.urgency}</Pill>
                    <span className="text-sm font-medium">{r.type}</span>
                    {r.bird && (
                      <Link href={`/birds/${r.bird.id}`} className="text-sm text-teal-700 hover:underline">
                        · {r.bird.name}
                      </Link>
                    )}
                    <span className="text-xs text-gray-500">· {r.foster.name}</span>
                  </div>
                  <p className="text-sm text-gray-700 mt-0.5 line-clamp-2">{r.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{fmtRelative(r.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Birds needing placement */}
        <Card tone={needFoster.length ? 'orange' : 'gray'}>
          <div className="flex items-center justify-between mb-3">
            <H2>Birds needing placement</H2>
            <Btn href="/birds/new" variant="ghost">+ Intake</Btn>
          </div>
          {needFoster.length === 0 ? (
            <Empty msg="Every bird placed. Quiet day at the cooler. 🕊️" />
          ) : (
            <ul className="divide-y divide-gray-100">
              {needFoster.slice(0, 6).map(b => (
                <li key={b.id} className="py-2.5 flex items-center gap-3">
                  <StatusDot tone={STATUS_TONE[b.status] || 'gray'} />
                  <Link href={`/birds/${b.id}`} className="font-medium hover:underline flex-1 truncate">
                    {b.name}
                  </Link>
                  <Pill tone={STATUS_TONE[b.status] || 'gray'}>{STATUS_LABELS[b.status] || b.status}</Pill>
                  {['high', 'critical'].includes(b.medicalPriority) && (
                    <Pill tone={PRIORITY_TONE[b.medicalPriority]}>{b.medicalPriority}</Pill>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* High stress fosters */}
        <Card tone={highStress.length ? 'red' : 'gray'}>
          <div className="flex items-center justify-between mb-3">
            <H2>Foster wellness — needs attention</H2>
            <Btn href="/fosters" variant="ghost">View all</Btn>
          </div>
          {highStress.length === 0 ? (
            <Empty msg="All fosters in healthy stress range." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {highStress.slice(0, 6).map(f => (
                <li key={f.id} className="py-2.5 flex items-center gap-3">
                  <StatusDot tone={stressTone(f.currentStress)} size="lg" />
                  <Link href={`/fosters/${f.id}`} className="font-medium hover:underline flex-1 truncate">
                    {f.name}
                  </Link>
                  <span className="text-xs text-gray-500">{stressLabel(f.currentStress)}</span>
                  <span className="text-sm font-semibold tabular-nums">{f.currentStress}/10</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Refills */}
        <Card tone={refillSoon.length ? 'red' : 'gray'}>
          <div className="flex items-center justify-between mb-3">
            <H2>Medication refills · 7-day window</H2>
            <Btn href="/medications" variant="ghost">View all</Btn>
          </div>
          {refillSoon.length === 0 ? (
            <Empty msg="No refills coming due in the next 7 days." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {refillSoon.slice(0, 6).map(m => {
                const days = m.days as number;
                const tone = days <= 1 ? 'red' : days <= 3 ? 'orange' : 'yellow';
                return (
                  <li key={m.id} className="py-2.5 flex items-center gap-3">
                    <StatusDot tone={tone} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {m.name} · <Link href={`/birds/${m.birdId}`} className="text-teal-700 hover:underline">{m.bird.name}</Link>
                      </div>
                      <div className="text-xs text-gray-500">
                        runout {fmtDate(m.runout)} · {m.frequency || '—'}
                      </div>
                    </div>
                    <Pill tone={tone}>{days <= 0 ? 'overdue' : `${days}d`}</Pill>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Calendar peek */}
        <Card tone="blue">
          <div className="flex items-center justify-between mb-3">
            <H2>Upcoming · next 8</H2>
            <Btn href="/calendar" variant="ghost">Open calendar</Btn>
          </div>
          {upcomingEvents.length === 0 ? (
            <Empty msg="No upcoming events scheduled." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {upcomingEvents.map(e => (
                <li key={e.id} className="py-2.5 flex items-center gap-3">
                  <CalendarIcon size={16} className="text-sky-600" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{e.title}</div>
                    <div className="text-xs text-gray-500">
                      {fmtDate(e.startsAt)} · {e.type}
                      {e.bird && (
                        <>
                          {' · '}
                          <Link href={`/birds/${e.bird.id}`} className="text-teal-700 hover:underline">
                            {e.bird.name}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Btn href="/birds/new" variant="primary">+ New bird intake</Btn>
        <Btn href="/fosters/new" variant="ghost">+ New foster</Btn>
        <Btn href="/requests/new" variant="ghost"><Inbox size={16} /> New request</Btn>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
  icon,
  href,
}: {
  label: string;
  value: number;
  tone: string;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card tone={tone} className="hover:shadow-md transition cursor-pointer">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-3xl font-bold tracking-tight tabular-nums">{value}</div>
            <div className="text-xs text-gray-600 uppercase tracking-wide mt-1">{label}</div>
          </div>
          <div className="text-gray-400">{icon}</div>
        </div>
      </Card>
    </Link>
  );
}
