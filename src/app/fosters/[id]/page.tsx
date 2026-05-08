import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, H2, Card, Pill, StatusDot, Btn, Empty, Field, inputClass } from '@/components/ui';
import { stressLabel, stressTone, MEDICAL_SKILLS } from '@/lib/constants';
import { fmtDateTime, fmtRelative } from '@/lib/utils';

export const dynamic = 'force-dynamic';

async function logWellness(fosterId: string, formData: FormData) {
  'use server';
  const stress = Math.max(1, Math.min(10, Number(formData.get('stressLevel') || 5)));
  await prisma.$transaction([
    prisma.wellnessLog.create({
      data: {
        fosterId,
        stressLevel: stress,
        capacityConfidence: formData.get('capacityConfidence') ? Number(formData.get('capacityConfidence')) : null,
        needsRehome: formData.get('needsRehome') === 'on',
        needsSupplies: formData.get('needsSupplies') === 'on',
        needsLeadership: formData.get('needsLeadership') === 'on',
        burnoutWarning: formData.get('burnoutWarning') === 'on',
        notes: String(formData.get('notes') || '') || null,
      },
    }),
    prisma.foster.update({
      where: { id: fosterId },
      data: { currentStress: stress },
    }),
  ]);
  redirect(`/fosters/${fosterId}`);
}

async function updateWhiteboard(fosterId: string, formData: FormData) {
  'use server';
  const note = String(formData.get('whiteboardNote') || '').trim() || null;
  await prisma.foster.update({ where: { id: fosterId }, data: { whiteboardNote: note } });
  redirect(`/fosters/${fosterId}`);
}

async function updateFoster(fosterId: string, formData: FormData) {
  'use server';
  await prisma.foster.update({
    where: { id: fosterId },
    data: {
      name: String(formData.get('name') || '').trim() || 'Foster',
      phone: String(formData.get('phone') || '') || null,
      email: String(formData.get('email') || '') || null,
      address: String(formData.get('address') || '') || null,
      capacity: Number(formData.get('capacity') || 0),
      medicalSkill: String(formData.get('medicalSkill') || 'none'),
      hasTransport: formData.get('hasTransport') === 'on',
      quarantineAble: formData.get('quarantineAble') === 'on',
      tubeFeedingSkill: formData.get('tubeFeedingSkill') === 'on',
      woundCareSkill: formData.get('woundCareSkill') === 'on',
      neonateSkill: formData.get('neonateSkill') === 'on',
      longTermAble: formData.get('longTermAble') === 'on',
      availability: String(formData.get('availability') || '') || null,
      notes: String(formData.get('notes') || '') || null,
    },
  });
  redirect(`/fosters/${fosterId}`);
}

export default async function FosterDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await prisma.foster.findUnique({
    where: { id },
    include: {
      birds: true,
      wellness: { orderBy: { createdAt: 'desc' }, take: 14 },
      requests: { orderBy: { createdAt: 'desc' }, take: 10, include: { bird: true } },
    },
  });
  if (!f) notFound();

  const tone = stressTone(f.currentStress);
  const wellnessAction = logWellness.bind(null, f.id);
  const whiteboardAction = updateWhiteboard.bind(null, f.id);
  const editAction = updateFoster.bind(null, f.id);

  return (
    <div className="space-y-4">
      <Link href="/fosters" className="text-sm text-teal-700 hover:underline">← Fosters</Link>
      <div className="flex items-start gap-3 flex-wrap">
        <StatusDot tone={tone} size="lg" />
        <div className="flex-1 min-w-0">
          <H1>{f.name}</H1>
          <p className="text-sm text-gray-600 mt-1">
            {stressLabel(f.currentStress)} · {f.currentStress}/10 · {f.birds.length}/{f.capacity || '—'} birds
          </p>
          {(f.phone || f.email) && (
            <p className="text-xs text-gray-500 mt-1">
              {f.phone && <span>{f.phone}</span>}
              {f.phone && f.email && <span> · </span>}
              {f.email && <span>{f.email}</span>}
            </p>
          )}
        </div>
      </div>

      {/* Whiteboard */}
      <Card tone="yellow">
        <H2>📌 Whiteboard</H2>
        <form action={whiteboardAction} className="mt-2 space-y-2">
          <textarea
            name="whiteboardNote"
            defaultValue={f.whiteboardNote ?? ''}
            rows={2}
            placeholder="Persistent visible note — e.g. 'Need pellets', 'No more medical birds this week'"
            className={inputClass}
          />
          <Btn type="submit" variant="primary">Save whiteboard</Btn>
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Wellness check */}
        <Card tone={tone}>
          <H2>Daily wellness check</H2>
          <form action={wellnessAction} className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">
                Stress level — 1 (great) to 10 (severe)
              </label>
              <input
                type="range"
                name="stressLevel"
                min={1}
                max={10}
                defaultValue={f.currentStress}
                className="w-full"
              />
              <div className="text-xs text-gray-500 flex justify-between mt-1">
                <span>1 stable</span><span>5 manageable</span><span>10 burnout risk</span>
              </div>
            </div>
            <Field label="Capacity confidence (1–10)">
              <input type="number" min={1} max={10} name="capacityConfidence" className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <CheckRow name="needsRehome" label="Need rehome" />
              <CheckRow name="needsSupplies" label="Need supplies" />
              <CheckRow name="needsLeadership" label="Need leadership help" />
              <CheckRow name="burnoutWarning" label="🚨 Burnout warning" />
            </div>
            <Field label="Notes">
              <textarea name="notes" rows={2} className={inputClass} />
            </Field>
            <Btn type="submit" variant="primary">Log wellness</Btn>
          </form>
        </Card>

        {/* Wellness history */}
        <Card>
          <H2>Wellness history</H2>
          {f.wellness.length === 0 ? (
            <Empty msg="No wellness logs yet." />
          ) : (
            <ul className="divide-y divide-gray-100 mt-3">
              {f.wellness.map(w => (
                <li key={w.id} className="py-2 flex items-center gap-3">
                  <StatusDot tone={stressTone(w.stressLevel)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{w.stressLevel}/10 · {stressLabel(w.stressLevel)}</div>
                    <div className="text-xs text-gray-500">{fmtDateTime(w.createdAt)}</div>
                    {(w.needsRehome || w.needsSupplies || w.needsLeadership || w.burnoutWarning) && (
                      <div className="flex gap-1.5 flex-wrap mt-1">
                        {w.burnoutWarning && <Pill tone="red">burnout warning</Pill>}
                        {w.needsRehome && <Pill tone="orange">need rehome</Pill>}
                        {w.needsSupplies && <Pill tone="yellow">need supplies</Pill>}
                        {w.needsLeadership && <Pill tone="orange">need leadership</Pill>}
                      </div>
                    )}
                    {w.notes && <p className="text-xs text-gray-600 mt-0.5">{w.notes}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Birds */}
      <Card>
        <H2>Birds in care</H2>
        {f.birds.length === 0 ? <Empty msg="No birds currently placed with this foster." /> : (
          <ul className="divide-y divide-gray-100 mt-3">
            {f.birds.map(b => (
              <li key={b.id} className="py-2 flex items-center gap-2">
                🕊
                <Link href={`/birds/${b.id}`} className="font-medium text-teal-700 hover:underline flex-1 truncate">{b.name}</Link>
                <span className="text-xs text-gray-500">{b.species || ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Edit */}
      <Card>
        <H2>Foster record</H2>
        <form action={editAction} className="grid gap-3 sm:grid-cols-2 mt-3">
          <Field label="Name"><input name="name" defaultValue={f.name} className={inputClass} /></Field>
          <Field label="Phone"><input name="phone" defaultValue={f.phone ?? ''} className={inputClass} /></Field>
          <Field label="Email"><input name="email" defaultValue={f.email ?? ''} className={inputClass} /></Field>
          <Field label="Address"><input name="address" defaultValue={f.address ?? ''} className={inputClass} /></Field>
          <Field label="Capacity"><input type="number" name="capacity" defaultValue={f.capacity} className={inputClass} /></Field>
          <Field label="Medical skill">
            <select name="medicalSkill" defaultValue={f.medicalSkill} className={inputClass}>
              {MEDICAL_SKILLS.map(s => (<option key={s} value={s}>{s}</option>))}
            </select>
          </Field>
          <Field label="Availability"><input name="availability" defaultValue={f.availability ?? ''} className={inputClass} /></Field>
          <div className="sm:col-span-2 grid grid-cols-2 gap-2">
            <CheckRow name="hasTransport" label="Has transport" defaultChecked={f.hasTransport} />
            <CheckRow name="quarantineAble" label="Quarantine setup" defaultChecked={f.quarantineAble} />
            <CheckRow name="tubeFeedingSkill" label="Tube feeding" defaultChecked={f.tubeFeedingSkill} />
            <CheckRow name="woundCareSkill" label="Wound care" defaultChecked={f.woundCareSkill} />
            <CheckRow name="neonateSkill" label="Neonates" defaultChecked={f.neonateSkill} />
            <CheckRow name="longTermAble" label="Long-term" defaultChecked={f.longTermAble} />
          </div>
          <Field label="Notes" className="sm:col-span-2">
            <textarea name="notes" defaultValue={f.notes ?? ''} rows={3} className={inputClass} />
          </Field>
          <div className="sm:col-span-2"><Btn type="submit" variant="primary">Save</Btn></div>
        </form>
      </Card>
    </div>
  );
}

function CheckRow({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 rounded border-gray-300" />
      {label}
    </label>
  );
}
