import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { H1, H2, Card, Pill, Btn, Empty, Field, inputClass, StatusDot } from '@/components/ui';
import { fmtDateTime, fmtRelative, daysUntil } from '@/lib/utils';
import { URGENCY_TONE, REQUEST_URGENCIES, TRANSPORT_STATUS_TONE, TRANSPORT_STATUSES } from '@/lib/constants';
import { activeBirdWhere } from '@/lib/filters';

export const dynamic = 'force-dynamic';

async function createRequest(formData: FormData) {
  'use server';
  const fromAddress = String(formData.get('fromAddress') || '').trim();
  const toAddress = String(formData.get('toAddress') || '').trim();
  const pickupBy = String(formData.get('pickupBy') || '');
  if (!fromAddress || !toAddress || !pickupBy) return;
  await prisma.transportRequest.create({
    data: {
      fromAddress,
      toAddress,
      pickupBy: new Date(pickupBy),
      deliverBy: formData.get('deliverBy') ? new Date(String(formData.get('deliverBy'))) : null,
      description: String(formData.get('description') || '') || null,
      urgency: String(formData.get('urgency') || 'normal'),
      birdId: String(formData.get('birdId') || '') || null,
    },
  });
  redirect('/transport');
}

async function assignVolunteer(id: string, volunteerId: string) {
  'use server';
  await prisma.transportRequest.update({
    where: { id },
    data: { volunteerId: volunteerId || null, status: volunteerId ? 'assigned' : 'open' },
  });
  redirect('/transport');
}

async function setStatus(id: string, status: string) {
  'use server';
  await prisma.transportRequest.update({ where: { id }, data: { status } });
  redirect('/transport');
}

async function createVolunteer(formData: FormData) {
  'use server';
  const linkedFosterId = String(formData.get('linkedFosterId') || '') || null;
  let baseData: Record<string, unknown> = {
    name: String(formData.get('name') || '').trim(),
    phone: String(formData.get('phone') || '') || null,
    email: String(formData.get('email') || '') || null,
    location: String(formData.get('location') || '') || null,
  };
  // If linking to an existing foster, copy contact fields from there.
  if (linkedFosterId) {
    const f = await prisma.foster.findUnique({ where: { id: linkedFosterId } });
    if (f) {
      baseData = {
        name: f.name,
        phone: f.phone,
        email: f.email,
        location: f.address,
      };
    }
  }
  if (!baseData.name) return;
  await prisma.transportVolunteer.create({
    data: {
      ...baseData,
      linkedFosterId,
      vehicleType: String(formData.get('vehicleType') || '') || null,
      maxDistanceMi: formData.get('maxDistanceMi') ? Number(formData.get('maxDistanceMi')) : null,
      medicalCapable: formData.get('medicalCapable') === 'on',
      availability: String(formData.get('availability') || '') || null,
      notes: String(formData.get('notes') || '') || null,
    } as Parameters<typeof prisma.transportVolunteer.create>[0]['data'],
  });
  redirect('/transport');
}

export default async function TransportPage() {
  const [requests, volunteers, birds, eligibleFosters] = await Promise.all([
    prisma.transportRequest.findMany({
      include: { volunteer: true },
      orderBy: [{ urgency: 'desc' }, { pickupBy: 'asc' }],
    }),
    prisma.transportVolunteer.findMany({
      include: { linkedFoster: true },
      orderBy: { name: 'asc' },
    }),
    prisma.bird.findMany({ where: activeBirdWhere, orderBy: { name: 'asc' } }),
    // Fosters not yet linked as a driver — candidates for cross-link.
    prisma.foster.findMany({
      where: { archivedAt: null, deletedAt: null, driverProfile: null },
      orderBy: { name: 'asc' },
    }),
  ]);

  const open = requests.filter(r => ['open', 'assigned', 'in_transit'].includes(r.status));
  const closed = requests.filter(r => ['delivered', 'cancelled'].includes(r.status));
  const unassigned = open.filter(r => !r.volunteerId);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <H1>Transport</H1>
          <p className="text-sm text-gray-600 mt-1">{open.length} active · {volunteers.length} drivers · {unassigned.length} unassigned</p>
        </div>
      </div>

      {/* Active requests */}
      <Card tone={unassigned.length ? 'red' : 'gray'}>
        <H2>Active transports</H2>
        {open.length === 0 ? <Empty msg="No active transport requests." /> : (
          <ul className="divide-y divide-gray-100 mt-3">
            {open.map(r => {
              const days = daysUntil(r.pickupBy);
              const overdue = days != null && days < 0;
              const statusTone = TRANSPORT_STATUS_TONE[r.status] || 'gray';
              return (
                <li key={r.id} className="py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusDot tone={overdue ? 'red' : URGENCY_TONE[r.urgency] || 'gray'} />
                    <Pill tone={URGENCY_TONE[r.urgency] || 'gray'}>{r.urgency}</Pill>
                    <Pill tone={statusTone}>{r.status.replace('_', ' ')}</Pill>
                    <span className="text-xs text-gray-500 ml-auto">{fmtRelative(r.createdAt)}</span>
                  </div>
                  <div className="mt-1 text-sm">
                    <strong>{r.fromAddress}</strong> → <strong>{r.toAddress}</strong>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Pickup by {fmtDateTime(r.pickupBy)}{overdue ? ' (OVERDUE)' : ''}
                    {r.deliverBy && ` · Deliver by ${fmtDateTime(r.deliverBy)}`}
                  </div>
                  {r.description && <p className="text-sm text-gray-700 mt-1">{r.description}</p>}
                  <div className="mt-2 flex gap-2 flex-wrap items-center">
                    <form action={async (fd) => { 'use server'; await assignVolunteer(r.id, String(fd.get('vid') || '')); }}>
                      <select name="vid" defaultValue={r.volunteerId || ''} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs">
                        <option value="">— unassigned —</option>
                        {volunteers.map(v => (<option key={v.id} value={v.id}>{v.name}</option>))}
                      </select>
                      <Btn type="submit" variant="ghost" className="ml-1">Assign</Btn>
                    </form>
                    {r.status === 'assigned' && (
                      <form action={async () => { 'use server'; await setStatus(r.id, 'in_transit'); }}><Btn type="submit" variant="ghost">Mark in transit</Btn></form>
                    )}
                    {['assigned', 'in_transit'].includes(r.status) && (
                      <form action={async () => { 'use server'; await setStatus(r.id, 'delivered'); }}><Btn type="submit" variant="primary">Delivered ✓</Btn></form>
                    )}
                    <form action={async () => { 'use server'; await setStatus(r.id, 'cancelled'); }}><Btn type="submit" variant="ghost">Cancel</Btn></form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* New request */}
      <Card>
        <H2>New transport request</H2>
        <form action={createRequest} className="grid gap-3 sm:grid-cols-2 mt-3">
          <Field label="From *"><input required name="fromAddress" placeholder="Pickup address / vet / foster" className={inputClass} /></Field>
          <Field label="To *"><input required name="toAddress" placeholder="Destination" className={inputClass} /></Field>
          <Field label="Pickup by *"><input required type="datetime-local" name="pickupBy" className={inputClass} /></Field>
          <Field label="Deliver by"><input type="datetime-local" name="deliverBy" className={inputClass} /></Field>
          <Field label="Bird">
            <select name="birdId" defaultValue="" className={inputClass}>
              <option value="">— none —</option>
              {birds.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </Field>
          <Field label="Urgency">
            <select name="urgency" defaultValue="normal" className={inputClass}>
              {REQUEST_URGENCIES.map(u => (<option key={u} value={u}>{u}</option>))}
            </select>
          </Field>
          <Field label="Notes / what's needed" className="sm:col-span-2">
            <textarea name="description" rows={2} className={inputClass} />
          </Field>
          <div className="sm:col-span-2"><Btn type="submit" variant="primary">+ Add request</Btn></div>
        </form>
      </Card>

      {/* Driver directory */}
      <Card tone="blue">
        <H2>Driver directory</H2>
        {volunteers.length === 0 ? <Empty msg="No drivers yet." /> : (
          <div className="grid gap-2 mt-3 sm:grid-cols-2">
            {volunteers.map(v => (
              <div key={v.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-semibold">{v.name}</div>
                  {v.linkedFoster && <Pill tone="purple">also a foster</Pill>}
                </div>
                <div className="text-xs text-gray-500">{v.location || 'location unknown'} · {v.vehicleType || 'vehicle ?'}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {v.phone || 'no phone'}
                  {v.maxDistanceMi != null && ` · up to ${v.maxDistanceMi} mi`}
                  {v.medicalCapable && ' · 🩺 medical'}
                </div>
                {v.availability && <div className="text-xs text-gray-500 mt-0.5">avail: {v.availability}</div>}
              </div>
            ))}
          </div>
        )}
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-teal-700">+ Add driver</summary>
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
            <Field label="Vehicle"><input name="vehicleType" placeholder="sedan / SUV / van" className={inputClass} /></Field>
            <Field label="Max distance (mi)"><input type="number" name="maxDistanceMi" className={inputClass} /></Field>
            <Field label="Availability" className="sm:col-span-2"><input name="availability" placeholder="weekends / evenings / on-call" className={inputClass} /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="medicalCapable" className="h-4 w-4" /> Comfortable transporting medical birds
            </label>
            <Field label="Notes" className="sm:col-span-2"><textarea name="notes" rows={2} className={inputClass} /></Field>
            <div className="sm:col-span-2"><Btn type="submit" variant="primary">+ Add driver</Btn></div>
          </form>
        </details>
      </Card>

      {/* Closed history */}
      {closed.length > 0 && (
        <Card>
          <details>
            <summary className="cursor-pointer font-semibold text-gray-700">Closed transports ({closed.length})</summary>
            <ul className="divide-y divide-gray-100 mt-3">
              {closed.slice(0, 30).map(r => (
                <li key={r.id} className="py-2 text-sm text-gray-500">
                  {fmtDateTime(r.pickupBy)} · {r.fromAddress} → {r.toAddress} · {r.status}
                </li>
              ))}
            </ul>
          </details>
        </Card>
      )}
    </div>
  );
}
