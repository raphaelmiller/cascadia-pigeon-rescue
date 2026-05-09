import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, H2, Card, Pill, Btn, Field, inputClass } from '@/components/ui';
import { fmtDateTime, fmtRelative } from '@/lib/utils';
import { TRANSPORT_STATUS_TONE } from '@/lib/constants';
import { activeFosterWhere } from '@/lib/filters';

export const dynamic = 'force-dynamic';

async function updateDriver(id: string, formData: FormData) {
  'use server';
  await prisma.transportVolunteer.update({
    where: { id },
    data: {
      name: String(formData.get('name') || '').trim() || 'Driver',
      phone: String(formData.get('phone') || '') || null,
      email: String(formData.get('email') || '') || null,
      location: String(formData.get('location') || '') || null,
      vehicleType: String(formData.get('vehicleType') || '') || null,
      maxDistanceMi: formData.get('maxDistanceMi') ? Number(formData.get('maxDistanceMi')) : null,
      medicalCapable: formData.get('medicalCapable') === 'on',
      availability: String(formData.get('availability') || '') || null,
      notes: String(formData.get('notes') || '') || null,
      linkedFosterId: String(formData.get('linkedFosterId') || '') || null,
    },
  });
  redirect(`/transport/drivers/${id}`);
}

async function deleteDriver(id: string) {
  'use server';
  await prisma.transportVolunteer.delete({ where: { id } });
  redirect('/transport');
}

export default async function DriverDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [driver, fosters, recent] = await Promise.all([
    prisma.transportVolunteer.findUnique({
      where: { id },
      include: { linkedFoster: true },
    }),
    prisma.foster.findMany({ where: activeFosterWhere, orderBy: { name: 'asc' } }),
    prisma.transportRequest.findMany({
      where: { volunteerId: id },
      orderBy: { pickupBy: 'desc' },
      take: 20,
    }),
  ]);
  if (!driver) notFound();

  const updateAction = updateDriver.bind(null, id);
  const deleteAction = deleteDriver.bind(null, id);

  const upcoming = recent.filter(r => ['assigned', 'in_transit', 'open'].includes(r.status));
  const completed = recent.filter(r => ['delivered', 'cancelled'].includes(r.status));

  return (
    <div className="space-y-4">
      <Link href="/transport" className="text-sm text-teal-700 hover:underline">← Transport</Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <H1>{driver.name}</H1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {driver.linkedFoster && <Pill tone="purple">also a foster</Pill>}
            {driver.medicalCapable && <Pill tone="blue">🩺 medical capable</Pill>}
            {driver.vehicleType && <Pill>{driver.vehicleType}</Pill>}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {driver.phone || 'no phone'}
            {driver.location && ` · ${driver.location}`}
            {driver.maxDistanceMi != null && ` · max ${driver.maxDistanceMi}mi`}
          </p>
        </div>
        <form action={deleteAction}>
          <Btn type="submit" variant="danger">⚠ Delete</Btn>
        </form>
      </div>

      <Card>
        <H2>Driver profile</H2>
        <form action={updateAction} className="grid gap-3 sm:grid-cols-2 mt-3">
          <Field label="Name *"><input required name="name" defaultValue={driver.name} className={inputClass} /></Field>
          <Field label="Phone"><input name="phone" defaultValue={driver.phone ?? ''} className={inputClass} /></Field>
          <Field label="Email"><input type="email" name="email" defaultValue={driver.email ?? ''} className={inputClass} /></Field>
          <Field label="Location"><input name="location" defaultValue={driver.location ?? ''} className={inputClass} /></Field>
          <Field label="Vehicle"><input name="vehicleType" defaultValue={driver.vehicleType ?? ''} placeholder="sedan / SUV / van" className={inputClass} /></Field>
          <Field label="Max distance (mi)"><input type="number" name="maxDistanceMi" defaultValue={driver.maxDistanceMi ?? ''} className={inputClass} /></Field>
          <Field label="Availability" className="sm:col-span-2">
            <input name="availability" defaultValue={driver.availability ?? ''} placeholder="weekends / evenings / on-call" className={inputClass} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="medicalCapable" defaultChecked={driver.medicalCapable} className="h-4 w-4" />
            Comfortable transporting medical birds
          </label>
          <Field label="Linked foster (cross-link)" className="sm:col-span-2" hint="Same person already in the foster directory? Pick them so updates flow.">
            <select name="linkedFosterId" defaultValue={driver.linkedFosterId ?? ''} className={inputClass}>
              <option value="">— not linked —</option>
              {fosters.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea name="notes" rows={3} defaultValue={driver.notes ?? ''} className={inputClass} />
          </Field>
          <div className="sm:col-span-2"><Btn type="submit" variant="primary">Save</Btn></div>
        </form>
      </Card>

      {upcoming.length > 0 && (
        <Card tone="blue">
          <H2>Upcoming / active jobs ({upcoming.length})</H2>
          <ul className="divide-y divide-gray-100 mt-3">
            {upcoming.map(r => (
              <li key={r.id} className="py-2.5">
                <Link href={`/transport/requests/${r.id}`} className="hover:underline text-sm">
                  <span className="font-medium">{r.fromAddress} → {r.toAddress}</span>
                </Link>
                <div className="text-xs text-gray-500 mt-0.5 flex gap-2 items-center flex-wrap">
                  <Pill tone={TRANSPORT_STATUS_TONE[r.status] || 'gray'}>{r.status.replace('_', ' ')}</Pill>
                  <span>{fmtDateTime(r.pickupBy)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {completed.length > 0 && (
        <Card>
          <details>
            <summary className="cursor-pointer font-semibold text-gray-700">History ({completed.length})</summary>
            <ul className="divide-y divide-gray-100 mt-3">
              {completed.map(r => (
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
