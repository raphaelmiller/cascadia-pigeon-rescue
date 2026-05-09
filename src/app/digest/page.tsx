import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, H2, Card, Pill, Empty, StatusDot, Btn } from '@/components/ui';
import { fmtDate, fmtDateTime, daysUntil, computeRunout } from '@/lib/utils';
import { stressTone, URGENCY_TONE, STATUS_LABELS } from '@/lib/constants';
import { activeBirdWhere, activeFosterWhere } from '@/lib/filters';

export const dynamic = 'force-dynamic';

export default async function DigestPage() {
  const now = new Date();
  const in48h = new Date(now.getTime() + 2 * 86400000);
  const in7d = new Date(now.getTime() + 7 * 86400000);

  const [
    eventsSoon, eventsWeek, bandagesSoon, refills, openTransport, openShifts,
    fosters, lowSupplies, urgentRequests, overdueEvents,
  ] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { startsAt: { gte: now, lte: in48h }, done: false },
      include: { bird: true },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.calendarEvent.findMany({
      where: { startsAt: { gt: in48h, lte: in7d }, done: false },
      include: { bird: true },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.bandageTask.findMany({
      where: { active: true, nextDueAt: { lte: in48h }, bird: activeBirdWhere },
      include: { bird: true },
      orderBy: { nextDueAt: 'asc' },
    }),
    prisma.medication.findMany({
      include: { bird: true },
      where: {
        OR: [{ stopDate: null }, { stopDate: { gt: now } }],
        bird: activeBirdWhere,
      },
    }),
    prisma.transportRequest.findMany({
      where: { status: { in: ['open', 'assigned', 'in_transit'] } },
      include: { volunteer: true },
      orderBy: { pickupBy: 'asc' },
    }),
    prisma.rescueShift.findMany({
      where: { startsAt: { lte: in7d }, endsAt: { gte: now }, volunteerId: null },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.foster.findMany({ where: activeFosterWhere }),
    prisma.supply.findMany({ where: { threshold: { gt: 0 } } }),
    prisma.request.findMany({
      where: { status: { in: ['open', 'in_progress'] }, urgency: { in: ['urgent', 'high'] } },
      include: { foster: true, bird: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.calendarEvent.findMany({
      where: { startsAt: { lt: now }, done: false },
      include: { bird: true },
    }),
  ]);

  const refillsSoon = refills
    .map(m => {
      const runout = computeRunout(m.startDate, m.daysSupplied, m.expectedRunOut);
      const days = runout ? daysUntil(runout) : null;
      return { ...m, runout, days };
    })
    .filter(m => m.runout && m.days !== null && m.days <= 7 && !m.refillDelivered)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

  const refillsNext48 = refillsSoon.filter(m => (m.days ?? 99) <= 2);
  const refillsWeek = refillsSoon.filter(m => (m.days ?? 99) > 2);

  const lowStock = lowSupplies.filter(s => s.onHand <= s.threshold);
  const burnoutRisk = fosters.filter(f => stressTone(f.currentStress) === 'red' || stressTone(f.currentStress) === 'orange');
  const transportNext48 = openTransport.filter(t => (daysUntil(t.pickupBy) ?? 99) <= 2);

  return (
    <div className="space-y-4">
      <H1>Daily Reminder Digest</H1>
      <p className="text-sm text-gray-600">Generated {fmtDateTime(now)}</p>

      {/* URGENT — next 48h */}
      <Card tone="red">
        <H2>🚨 Next 48 hours</H2>

        {overdueEvents.length > 0 && (
          <Section label="OVERDUE — calendar">
            <ul className="divide-y divide-gray-100">
              {overdueEvents.map(e => (
                <li key={e.id} className="py-2 flex items-center gap-2">
                  <StatusDot tone="red" />
                  <span className="text-sm">{e.title}</span>
                  <span className="text-xs text-gray-500">· {fmtDate(e.startsAt)}</span>
                  {e.bird && <Link href={`/birds/${e.bird.id}`} className="text-xs text-teal-700 hover:underline ml-auto">{e.bird.name}</Link>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section label="Vet appointments / bandage / transfers / etc.">
          {eventsSoon.length === 0 ? <Empty msg="Nothing scheduled in the next 48h." /> : (
            <ul className="divide-y divide-gray-100">
              {eventsSoon.map(e => (
                <li key={e.id} className="py-2 flex items-center gap-2">
                  <Pill tone="orange">{e.type}</Pill>
                  <span className="text-sm flex-1">{e.title}</span>
                  <span className="text-xs text-gray-500">{fmtDateTime(e.startsAt)}</span>
                  {e.bird && <Link href={`/birds/${e.bird.id}`} className="text-xs text-teal-700 hover:underline">{e.bird.name}</Link>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section label="Bandage changes">
          {bandagesSoon.length === 0 ? <Empty msg="No bandage changes due in 48h." /> : (
            <ul className="divide-y divide-gray-100">
              {bandagesSoon.map(t => (
                <li key={t.id} className="py-2 flex items-center gap-2">
                  <Pill tone="orange">bandage</Pill>
                  <span className="text-sm flex-1">{t.description}</span>
                  <Link href={`/birds/${t.birdId}`} className="text-xs text-teal-700 hover:underline">{t.bird.name}</Link>
                  <span className="text-xs text-gray-500">{fmtDateTime(t.nextDueAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section label="Medication runouts (≤2d)">
          {refillsNext48.length === 0 ? <Empty msg="No medication runouts in 48h." /> : (
            <ul className="divide-y divide-gray-100">
              {refillsNext48.map(m => (
                <li key={m.id} className="py-2 flex items-center gap-2">
                  <Pill tone="red">{(m.days ?? 0) <= 0 ? 'overdue' : `${m.days}d`}</Pill>
                  <span className="text-sm flex-1">{m.name} · <Link href={`/birds/${m.birdId}`} className="text-teal-700 hover:underline">{m.bird.name}</Link></span>
                  <span className="text-xs text-gray-500">runout {fmtDate(m.runout)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section label="Critical transfers / transport">
          {transportNext48.length === 0 ? <Empty msg="No transport in next 48h." /> : (
            <ul className="divide-y divide-gray-100">
              {transportNext48.map(t => (
                <li key={t.id} className="py-2 flex items-center gap-2">
                  <Pill tone={URGENCY_TONE[t.urgency] || 'gray'}>{t.urgency}</Pill>
                  <span className="text-sm flex-1 truncate">{t.fromAddress} → {t.toAddress}</span>
                  <span className="text-xs text-gray-500">{fmtDateTime(t.pickupBy)}</span>
                  <span className="text-xs">{t.volunteer?.name || <span className="text-orange-700">unassigned</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section label="Rescue coverage gaps (next 7d)">
          {openShifts.length === 0 ? <Empty msg="All rescue shifts covered." /> : (
            <ul className="divide-y divide-gray-100">
              {openShifts.map(s => (
                <li key={s.id} className="py-2 flex items-center gap-2">
                  <Pill tone="orange">unassigned</Pill>
                  <span className="text-sm flex-1">{s.area || 'general'}</span>
                  <span className="text-xs text-gray-500">{fmtDateTime(s.startsAt)} → {fmtDateTime(s.endsAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section label="🚨 Urgent foster requests">
          {urgentRequests.length === 0 ? <Empty msg="No urgent requests." /> : (
            <ul className="divide-y divide-gray-100">
              {urgentRequests.map(r => (
                <li key={r.id} className="py-2 flex items-start gap-2">
                  <Pill tone={URGENCY_TONE[r.urgency] || 'gray'}>{r.urgency}</Pill>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{r.type} · {r.foster.name}</div>
                    <p className="text-xs text-gray-600 line-clamp-2">{r.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section label="Foster burnout risk">
          {burnoutRisk.length === 0 ? <Empty msg="All fosters in healthy range." /> : (
            <ul className="divide-y divide-gray-100">
              {burnoutRisk.map(f => (
                <li key={f.id} className="py-2 flex items-center gap-2">
                  <StatusDot tone={stressTone(f.currentStress)} />
                  <Link href={`/fosters/${f.id}`} className="text-sm font-medium hover:underline">{f.name}</Link>
                  <span className="text-xs text-gray-500">stress {f.currentStress}/10</span>
                  {f.whiteboardNote && <span className="text-xs text-yellow-800 bg-yellow-50 px-2 py-0.5 rounded ml-auto">📌 {f.whiteboardNote.slice(0, 60)}{f.whiteboardNote.length > 60 ? '…' : ''}</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section label="Low-stock supplies">
          {lowStock.length === 0 ? <Empty msg="Stock levels OK." /> : (
            <ul className="divide-y divide-gray-100">
              {lowStock.map(s => (
                <li key={s.id} className="py-2 flex items-center gap-2">
                  <StatusDot tone={s.onHand === 0 ? 'red' : 'orange'} />
                  <span className="text-sm flex-1">{s.name}</span>
                  <span className="text-xs text-gray-500">{s.onHand} {s.unit || ''} · threshold {s.threshold}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </Card>

      {/* Weekly overview */}
      <Card tone="blue">
        <H2>📅 This week</H2>

        <Section label="Calendar (3-7 days out)">
          {eventsWeek.length === 0 ? <Empty msg="Nothing further this week." /> : (
            <ul className="divide-y divide-gray-100">
              {eventsWeek.map(e => (
                <li key={e.id} className="py-2 flex items-center gap-2">
                  <Pill>{e.type}</Pill>
                  <span className="text-sm flex-1">{e.title}</span>
                  <span className="text-xs text-gray-500">{fmtDate(e.startsAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section label="Refills 3-7 days out">
          {refillsWeek.length === 0 ? <Empty msg="No further refills due this week." /> : (
            <ul className="divide-y divide-gray-100">
              {refillsWeek.map(m => (
                <li key={m.id} className="py-2 flex items-center gap-2">
                  <Pill tone="yellow">{m.days}d</Pill>
                  <span className="text-sm flex-1">{m.name} · {m.bird.name}</span>
                  <span className="text-xs text-gray-500">{fmtDate(m.runout)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <Btn href="/" variant="ghost">← Dashboard</Btn>
        <Btn href="/calendar" variant="ghost">Open calendar</Btn>
        <Btn href="/medications" variant="ghost">Meds</Btn>
        <Btn href="/transport" variant="ghost">Transport</Btn>
        <Btn href="/rescue" variant="ghost">Rescue shifts</Btn>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">{label}</h3>
      {children}
    </div>
  );
}
