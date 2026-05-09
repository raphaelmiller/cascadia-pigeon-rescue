import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, H2, Card, Pill, StatusDot, Btn, Empty, Field, inputClass } from '@/components/ui';
import { stressLabel, stressTone, REHAB_PROFICIENCY, REHAB_PROFICIENCY_LABEL, REHAB_SKILLS, REHAB_SKILLS_TOTAL, rehabScore, rehabScoreTone } from '@/lib/constants';
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

async function archiveFoster(fosterId: string) {
  'use server';
  await prisma.foster.update({ where: { id: fosterId }, data: { archivedAt: new Date(), deletedAt: null } });
  redirect(`/fosters/${fosterId}`);
}

async function softDeleteFoster(fosterId: string) {
  'use server';
  await prisma.foster.update({ where: { id: fosterId }, data: { deletedAt: new Date() } });
  redirect('/archive');
}

async function restoreFoster(fosterId: string) {
  'use server';
  await prisma.foster.update({ where: { id: fosterId }, data: { archivedAt: null, deletedAt: null } });
  redirect(`/fosters/${fosterId}`);
}

async function updateFoster(fosterId: string, formData: FormData) {
  'use server';
  const skillData: Record<string, boolean> = {};
  for (const s of REHAB_SKILLS) skillData[s.key] = formData.get(s.key) === 'on';
  await prisma.foster.update({
    where: { id: fosterId },
    data: {
      name: String(formData.get('name') || '').trim() || 'Foster',
      phone: String(formData.get('phone') || '') || null,
      email: String(formData.get('email') || '') || null,
      address: String(formData.get('address') || '') || null,
      capacity: Number(formData.get('capacity') || 0),
      medicalSkill: String(formData.get('medicalSkill') || 'beginner'),
      preferredTypes: String(formData.get('preferredTypes') || '') || null,
      longTermAble: formData.get('longTermAble') === 'on',
      canTransportSelf: formData.get('canTransportSelf') === 'on',
      notes: String(formData.get('notes') || '') || null,
      ...skillData,
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
      driverProfile: true,
      rescuerProfile: true,
    },
  });
  if (!f) notFound();

  const tone = stressTone(f.currentStress);
  const wellnessAction = logWellness.bind(null, f.id);
  const whiteboardAction = updateWhiteboard.bind(null, f.id);
  const editAction = updateFoster.bind(null, f.id);
  const archiveAction = archiveFoster.bind(null, f.id);
  const deleteAction = softDeleteFoster.bind(null, f.id);
  const restoreAction = restoreFoster.bind(null, f.id);
  const isArchived = !!f.archivedAt;
  const isDeleted = !!f.deletedAt;

  return (
    <div className="space-y-4">
      <Link href="/fosters" className="text-sm text-teal-700 hover:underline">← Fosters</Link>
      <div className="flex items-start gap-3 flex-wrap">
        <StatusDot tone={tone} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <H1>{f.name}</H1>
            {isDeleted && <Pill tone="red">deleted</Pill>}
            {isArchived && !isDeleted && <Pill tone="gray">archived</Pill>}
            <Pill tone="purple">foster</Pill>
            {f.driverProfile && <Pill tone="blue">also a driver</Pill>}
            {f.rescuerProfile && <Pill tone="orange">also a rescuer</Pill>}
          </div>
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
        <div className="flex gap-2 flex-wrap">
          {(isArchived || isDeleted) ? (
            <form action={restoreAction}>
              <Btn type="submit" variant="primary">↺ Restore</Btn>
            </form>
          ) : (
            <>
              <form action={archiveAction}>
                <Btn type="submit" variant="ghost">Archive</Btn>
              </form>
              <form action={deleteAction}>
                <Btn type="submit" variant="danger">Delete</Btn>
              </form>
            </>
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

      {/* Rehab skills score (read-only display, set in edit form below) */}
      <Card tone={rehabScoreTone(rehabScore(f as unknown as Record<string, unknown>))}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <H2>Rehab skills</H2>
          <span className="text-2xl font-bold tabular-nums">
            {rehabScore(f as unknown as Record<string, unknown>)}
            <span className="text-sm text-gray-500 font-normal"> / {REHAB_SKILLS_TOTAL}</span>
          </span>
        </div>
        <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${(rehabScore(f as unknown as Record<string, unknown>) / REHAB_SKILLS_TOTAL) * 100}%` }}
          />
        </div>
        <div className="mt-3 grid gap-1 sm:grid-cols-2 text-sm">
          {REHAB_SKILLS.map(s => {
            const checked = (f as unknown as Record<string, unknown>)[s.key];
            return (
              <div key={s.key} className={`flex items-start gap-2 px-2 py-1 rounded ${checked ? 'text-emerald-800 bg-emerald-50' : 'text-gray-400'}`}>
                <span>{checked ? '✓' : '·'}</span>
                <span>{s.label}</span>
              </div>
            );
          })}
        </div>
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
          <Field label="Rehab proficiency">
            <select name="medicalSkill" defaultValue={REHAB_PROFICIENCY.includes(f.medicalSkill as never) ? f.medicalSkill : 'beginner'} className={inputClass}>
              {REHAB_PROFICIENCY.map(s => (
                <option key={s} value={s}>{REHAB_PROFICIENCY_LABEL[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="Preferred types" className="sm:col-span-2">
            <input name="preferredTypes" defaultValue={f.preferredTypes ?? ''} className={inputClass} />
          </Field>

          <div className="sm:col-span-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Rehab skills ({rehabScore(f as unknown as Record<string, unknown>)} / {REHAB_SKILLS_TOTAL} checked)
            </h4>
            <div className="grid gap-1 sm:grid-cols-2">
              {REHAB_SKILLS.map(s => {
                const checked = (f as unknown as Record<string, unknown>)[s.key];
                return (
                  <label key={s.key} className="flex items-start gap-2 text-sm rounded-lg p-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      name={s.key}
                      defaultChecked={!!checked}
                      className="h-4 w-4 mt-0.5 rounded border-gray-300"
                    />
                    <span>{s.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="sm:col-span-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Transport</h4>
            <CheckRow name="canTransportSelf" label="Can transport birds themselves" defaultChecked={f.canTransportSelf} />
          </div>

          <div className="sm:col-span-2">
            <CheckRow name="longTermAble" label="Available for long-term foster" defaultChecked={f.longTermAble} />
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
