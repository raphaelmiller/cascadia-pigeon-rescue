import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, H2, Card, Pill, Btn, Field, inputClass } from '@/components/ui';
import { fmtDateTime, fmtRelative, daysUntil, isOverdue } from '@/lib/utils';
import { TRANSPORT_STATUSES, TRANSPORT_STATUS_TONE, REQUEST_URGENCIES, URGENCY_TONE } from '@/lib/constants';
import { activeBirdWhere } from '@/lib/filters';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function updateRequest(id: string, formData: FormData) {
  'use server';
  await requireOperator();
  const pickupBy = String(formData.get('pickupBy') || '');
  const fromAddress = String(formData.get('fromAddress') || '').trim();
  const toAddress = String(formData.get('toAddress') || '').trim();
  if (!pickupBy || !fromAddress || !toAddress) return;
  await prisma.transportRequest.update({
    where: { id },
    data: {
      fromAddress,
      toAddress,
      pickupBy: new Date(pickupBy),
      deliverBy: formData.get('deliverBy') ? new Date(String(formData.get('deliverBy'))) : null,
      urgency: String(formData.get('urgency') || 'normal'),
      status: String(formData.get('status') || 'open'),
      description: String(formData.get('description') || '') || null,
      notes: String(formData.get('notes') || '') || null,
      birdId: String(formData.get('birdId') || '') || null,
      volunteerId: String(formData.get('volunteerId') || '') || null,
    },
  });
  redirect(`/transport/requests/${id}`);
}

async function deleteRequest(id: string) {
  'use server';
  await requireOperator();
  await prisma.transportRequest.delete({ where: { id } });
  redirect('/transport');
}

export default async function TransportRequestDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [req, drivers, birds] = await Promise.all([
    prisma.transportRequest.findUnique({
      where: { id },
      include: { volunteer: true },
    }),
    prisma.transportVolunteer.findMany({ orderBy: { name: 'asc' } }),
    prisma.bird.findMany({ where: activeBirdWhere, orderBy: { name: 'asc' } }),
  ]);
  if (!req) notFound();

  const updateAction = updateRequest.bind(null, id);
  const deleteAction = deleteRequest.bind(null, id);
  const overdue = !['delivered', 'cancelled'].includes(req.status) && isOverdue(req.pickupBy);
  const days = daysUntil(req.pickupBy);

  return (
    <div className="space-y-4">
      <Link href="/transport" className="text-sm text-teal-700 hover:underline">← Transport</Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <H1>Transport job</H1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Pill tone={URGENCY_TONE[req.urgency] || 'gray'}>{req.urgency}</Pill>
            <Pill tone={TRANSPORT_STATUS_TONE[req.status] || 'gray'}>{req.status.replace('_', ' ')}</Pill>
            {!req.volunteerId && <Pill tone="red">unassigned</Pill>}
            {overdue && <Pill tone="red">overdue</Pill>}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Created {fmtRelative(req.createdAt)}
            {req.updatedAt && req.updatedAt.getTime() !== req.createdAt.getTime() && (
              <> · last updated {fmtRelative(req.updatedAt)}</>
            )}
            {days != null && (
              <> · pickup {days < 0 ? `${-days}d ago` : days === 0 ? 'today' : `in ${days}d`}</>
            )}
          </p>
        </div>
        <form action={deleteAction}>
          <Btn type="submit" variant="danger">⚠ Delete</Btn>
        </form>
      </div>

      <Card>
        <H2>Edit job</H2>
        <form action={updateAction} className="grid gap-3 sm:grid-cols-2 mt-3">
          <Field label="From *">
            <input required name="fromAddress" defaultValue={req.fromAddress} className={inputClass} />
          </Field>
          <Field label="To *">
            <input required name="toAddress" defaultValue={req.toAddress} className={inputClass} />
          </Field>
          <Field label="Pickup by *">
            <input
              required
              type="datetime-local"
              name="pickupBy"
              defaultValue={toLocalDatetime(req.pickupBy)}
              className={inputClass}
            />
          </Field>
          <Field label="Deliver by">
            <input
              type="datetime-local"
              name="deliverBy"
              defaultValue={req.deliverBy ? toLocalDatetime(req.deliverBy) : ''}
              className={inputClass}
            />
          </Field>
          <Field label="Urgency">
            <select name="urgency" defaultValue={req.urgency} className={inputClass}>
              {REQUEST_URGENCIES.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={req.status} className={inputClass}>
              {TRANSPORT_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label="Bird">
            <select name="birdId" defaultValue={req.birdId ?? ''} className={inputClass}>
              <option value="">— none —</option>
              {birds.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Driver">
            <select name="volunteerId" defaultValue={req.volunteerId ?? ''} className={inputClass}>
              <option value="">— unassigned —</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.maxDistanceMi ? ` · ≤${d.maxDistanceMi}mi` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description / what's needed" className="sm:col-span-2">
            <textarea name="description" rows={3} defaultValue={req.description ?? ''} className={inputClass} />
          </Field>
          <Field label="Internal notes" className="sm:col-span-2">
            <textarea name="notes" rows={2} defaultValue={req.notes ?? ''} className={inputClass} />
          </Field>
          <div className="sm:col-span-2 flex gap-2">
            <Btn type="submit" variant="primary">Save changes</Btn>
            <Btn href="/transport" variant="ghost">Cancel</Btn>
          </div>
        </form>
      </Card>

      {/* Quick-flip status buttons */}
      <Card>
        <H2>Quick actions</H2>
        <div className="mt-3 flex gap-2 flex-wrap">
          {req.status !== 'assigned' && (
            <form action={async () => { 'use server'; await requireOperator(); await prisma.transportRequest.update({ where: { id }, data: { status: 'assigned' } }); redirect(`/transport/requests/${id}`); }}>
              <Btn type="submit" variant="ghost">Mark assigned</Btn>
            </form>
          )}
          {req.status !== 'in_transit' && (
            <form action={async () => { 'use server'; await requireOperator(); await prisma.transportRequest.update({ where: { id }, data: { status: 'in_transit' } }); redirect(`/transport/requests/${id}`); }}>
              <Btn type="submit" variant="ghost">Mark in transit</Btn>
            </form>
          )}
          {req.status !== 'delivered' && (
            <form action={async () => { 'use server'; await requireOperator(); await prisma.transportRequest.update({ where: { id }, data: { status: 'delivered' } }); redirect(`/transport/requests/${id}`); }}>
              <Btn type="submit" variant="primary">Delivered ✓</Btn>
            </form>
          )}
          {req.status !== 'cancelled' && (
            <form action={async () => { 'use server'; await requireOperator(); await prisma.transportRequest.update({ where: { id }, data: { status: 'cancelled' } }); redirect(`/transport/requests/${id}`); }}>
              <Btn type="submit" variant="ghost">Cancel job</Btn>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}

// Convert a Date to a value usable in <input type="datetime-local"> (local TZ, no Z).
function toLocalDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
}
