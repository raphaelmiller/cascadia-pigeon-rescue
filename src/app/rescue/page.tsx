import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { H1, H2, Card, Pill, Btn, Empty, Field, inputClass } from '@/components/ui';
import { fmtDateTime } from '@/lib/utils';
import { SHIFT_TYPES, SHIFT_TYPE_TONE } from '@/lib/constants';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function createVolunteer(formData: FormData) {
  'use server';
  await requireOperator();
  const linkedFosterId = String(formData.get('linkedFosterId') || '') || null;
  let baseData: Record<string, unknown> = {
    name: String(formData.get('name') || '').trim(),
    phone: String(formData.get('phone') || '') || null,
    email: String(formData.get('email') || '') || null,
    location: String(formData.get('location') || '') || null,
  };
  if (linkedFosterId) {
    const f = await prisma.foster.findUnique({ where: { id: linkedFosterId } });
    if (f) {
      baseData = { name: f.name, phone: f.phone, email: f.email, location: f.address };
    }
  }
  if (!baseData.name) return;
  await prisma.rescueVolunteer.create({
    data: {
      ...baseData,
      linkedFosterId,
      skills: String(formData.get('skills') || '') || null,
      emergencyResponse: formData.get('emergencyResponse') === 'on',
      availability: String(formData.get('availability') || '') || null,
      notes: String(formData.get('notes') || '') || null,
    } as Parameters<typeof prisma.rescueVolunteer.create>[0]['data'],
  });
  redirect('/rescue');
}

async function createShift(formData: FormData) {
  'use server';
  await requireOperator();
  const startsAt = String(formData.get('startsAt') || '');
  const endsAt = String(formData.get('endsAt') || '');
  if (!startsAt || !endsAt) return;
  await prisma.rescueShift.create({
    data: {
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      shiftType: String(formData.get('shiftType') || 'on_call'),
      area: String(formData.get('area') || '') || null,
      volunteerId: String(formData.get('volunteerId') || '') || null,
      notes: String(formData.get('notes') || '') || null,
    },
  });
  redirect('/rescue');
}

async function claimShift(id: string, volunteerId: string) {
  'use server';
  await requireOperator();
  await prisma.rescueShift.update({ where: { id }, data: { volunteerId: volunteerId || null } });
  redirect('/rescue');
}

export default async function RescuePage() {
  const now = new Date();
  const in14d = new Date(now.getTime() + 14 * 86400000);
  const [shifts, volunteers] = await Promise.all([
    prisma.rescueShift.findMany({
      where: { endsAt: { gte: now }, startsAt: { lte: in14d } },
      include: { volunteer: true },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.rescueVolunteer.findMany({
      include: { linkedFoster: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  const eligibleFosters = await prisma.foster.findMany({
    where: { archivedAt: null, deletedAt: null, rescuerProfile: null },
    orderBy: { name: 'asc' },
  });

  const today = shifts.filter(s => s.startsAt < new Date(now.getTime() + 86400000));
  const open = shifts.filter(s => !s.volunteerId);
  const next7 = shifts.filter(s => s.startsAt < new Date(now.getTime() + 7 * 86400000));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <H1>Rescue Shifts</H1>
        <div className="flex gap-2 flex-wrap">
          <Btn href="/rescue/availability" variant="ghost">Rescuer availability →</Btn>
          <Btn href="/rescue/shifts" variant="ghost">Calendar →</Btn>
        </div>
      </div>

      {/* Today coverage */}
      <Card tone={today.filter(s => s.volunteerId).length === 0 ? 'red' : 'green'}>
        <H2>Today's coverage</H2>
        {today.length === 0 ? (
          <Empty msg="No shifts scheduled in the next 24 hours." />
        ) : (
          <ul className="divide-y divide-gray-100 mt-3">
            {today.map(s => (
              <ShiftRow key={s.id} shift={s} volunteers={volunteers} claim={claimShift} />
            ))}
          </ul>
        )}
      </Card>

      {/* Open shifts */}
      <Card tone={open.length ? 'orange' : 'gray'}>
        <H2>Open / unassigned shifts (next 14d)</H2>
        {open.length === 0 ? (
          <Empty msg="All shifts are claimed. 🟢" />
        ) : (
          <ul className="divide-y divide-gray-100 mt-3">
            {open.map(s => (
              <ShiftRow key={s.id} shift={s} volunteers={volunteers} claim={claimShift} />
            ))}
          </ul>
        )}
      </Card>

      {/* Next 7 days */}
      <Card tone="blue">
        <H2>Next 7 days</H2>
        {next7.length === 0 ? <Empty msg="Nothing scheduled in the next 7 days." /> : (
          <ul className="divide-y divide-gray-100 mt-3">
            {next7.map(s => (
              <ShiftRow key={s.id} shift={s} volunteers={volunteers} claim={claimShift} />
            ))}
          </ul>
        )}
      </Card>

      {/* New shift */}
      <Card>
        <H2>Schedule a shift</H2>
        <form action={createShift} className="grid gap-3 sm:grid-cols-2 mt-3">
          <Field label="Starts *"><input required type="datetime-local" name="startsAt" className={inputClass} /></Field>
          <Field label="Ends *"><input required type="datetime-local" name="endsAt" className={inputClass} /></Field>
          <Field label="Type">
            <select name="shiftType" defaultValue="on_call" className={inputClass}>
              {SHIFT_TYPES.map(t => (<option key={t} value={t}>{t.replace('_', ' ')}</option>))}
            </select>
          </Field>
          <Field label="Area">
            <input name="area" placeholder="Seattle / Tacoma / Eastside" className={inputClass} />
          </Field>
          <Field label="Volunteer">
            <select name="volunteerId" defaultValue="" className={inputClass}>
              <option value="">— open —</option>
              {volunteers.map(v => (<option key={v.id} value={v.id}>{v.name}</option>))}
            </select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea name="notes" rows={2} className={inputClass} />
          </Field>
          <div className="sm:col-span-2"><Btn type="submit" variant="primary">+ Add shift</Btn></div>
        </form>
      </Card>

      {/* Volunteer directory */}
      <Card tone="blue">
        <H2>Rescue volunteer directory</H2>
        {volunteers.length === 0 ? <Empty msg="No rescue volunteers yet." /> : (
          <div className="grid gap-2 mt-3 sm:grid-cols-2">
            {volunteers.map(v => (
              <div key={v.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-semibold">{v.name}</div>
                  {v.linkedFoster && <Pill tone="purple">also a foster</Pill>}
                  <Link href={`/rescue/rescuers/${v.id}/availability`} className="ml-auto text-xs text-teal-700 hover:underline">
                    availability →
                  </Link>
                </div>
                <div className="text-xs text-gray-500">
                  {v.location || 'location ?'}
                  {v.emergencyResponse && ' · 🚨 emergency response'}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{v.phone || ''}</div>
                {v.skills && <div className="text-xs text-gray-600 mt-1">{v.skills}</div>}
                {v.availability && <div className="text-xs text-gray-500 mt-0.5">avail: {v.availability}</div>}
              </div>
            ))}
          </div>
        )}
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-teal-700">+ Add rescue volunteer</summary>
          <form action={createVolunteer} className="grid gap-3 sm:grid-cols-2 mt-3">
            <Field label="Or link to existing foster" className="sm:col-span-2" hint="If they're already a foster, pick them here — contact info auto-fills.">
              <select name="linkedFosterId" defaultValue="" className={inputClass}>
                <option value="">— new person —</option>
                {eligibleFosters.map(f => (
                  <option key={f.id} value={f.id}>{f.name} · foster</option>
                ))}
              </select>
            </Field>
            <Field label="Name (if not linking)"><input name="name" className={inputClass} /></Field>
            <Field label="Phone"><input name="phone" className={inputClass} /></Field>
            <Field label="Email"><input type="email" name="email" className={inputClass} /></Field>
            <Field label="Location"><input name="location" className={inputClass} /></Field>
            <Field label="Skills" className="sm:col-span-2">
              <input name="skills" placeholder="climbing, netting, first-aid, driver…" className={inputClass} />
            </Field>
            <Field label="Availability" className="sm:col-span-2">
              <input name="availability" placeholder="weekends / on-call / evenings" className={inputClass} />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="emergencyResponse" className="h-4 w-4" /> Available for emergency response
            </label>
            <Field label="Notes" className="sm:col-span-2"><textarea name="notes" rows={2} className={inputClass} /></Field>
            <div className="sm:col-span-2"><Btn type="submit" variant="primary">+ Add volunteer</Btn></div>
          </form>
        </details>
      </Card>
    </div>
  );
}

function ShiftRow({
  shift,
  volunteers,
  claim,
}: {
  shift: any;
  volunteers: any[];
  claim: (id: string, vid: string) => Promise<void>;
}) {
  return (
    <li className="py-2.5 flex items-start gap-3 flex-wrap">
      <Pill tone={SHIFT_TYPE_TONE[shift.shiftType] || 'gray'}>{shift.shiftType.replace('_', ' ')}</Pill>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">
          {fmtDateTime(shift.startsAt)} → {fmtDateTime(shift.endsAt)}
        </div>
        <div className="text-xs text-gray-500">
          {shift.area ? `${shift.area} · ` : ''}
          {shift.volunteer ? <strong>{shift.volunteer.name}</strong> : <span className="text-orange-700">UNASSIGNED</span>}
          {shift.notes ? ` · ${shift.notes}` : ''}
        </div>
      </div>
      <form action={async (fd) => { 'use server'; await requireOperator(); await claim(shift.id, String(fd.get('vid') || '')); }}>
        <select name="vid" defaultValue={shift.volunteerId || ''} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs">
          <option value="">— open —</option>
          {volunteers.map(v => (<option key={v.id} value={v.id}>{v.name}</option>))}
        </select>
        <Btn type="submit" variant="ghost" className="ml-1">Assign</Btn>
      </form>
    </li>
  );
}
