import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, H2, Card, Pill, StatusDot, Btn, Empty, Field, inputClass } from '@/components/ui';
import {
  stressLabel, stressTone,
  ALL_SKILL_KEYS, SKILL_TIERS, MAX_CLINICAL, MAX_QUALITY,
  clinicalScore, qualityScore, clinicalCategory, clinicalCategoryTone,
  qualityCategory, qualityCategoryTone,
} from '@/lib/constants';
import { SkillAssessment } from '@/components/SkillAssessment';
import { fmtDateTime, fmtRelative } from '@/lib/utils';
import { saveUpload, deleteUpload } from '@/lib/uploads';
import { requireOperator } from '@/lib/auth';
import { parseForm, fosterUpdateSchema } from '@/lib/schemas';
import { PartialDatePicker } from '@/components/PartialDatePicker';
import { formatPartialDate } from '@/lib/partialDate';

export const dynamic = 'force-dynamic';

async function logWellness(fosterId: string, formData: FormData) {
  'use server';
  await requireOperator();
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
  await requireOperator();
  const note = String(formData.get('whiteboardNote') || '').trim() || null;
  await prisma.foster.update({ where: { id: fosterId }, data: { whiteboardNote: note } });
  redirect(`/fosters/${fosterId}`);
}

async function archiveFoster(fosterId: string) {
  'use server';
  await requireOperator();
  await prisma.foster.update({ where: { id: fosterId }, data: { archivedAt: new Date(), deletedAt: null } });
  redirect(`/fosters/${fosterId}`);
}

async function softDeleteFoster(fosterId: string) {
  'use server';
  await requireOperator();
  await prisma.foster.update({ where: { id: fosterId }, data: { deletedAt: new Date() } });
  redirect('/archive');
}

async function restoreFoster(fosterId: string) {
  'use server';
  await requireOperator();
  await prisma.foster.update({ where: { id: fosterId }, data: { archivedAt: null, deletedAt: null } });
  redirect(`/fosters/${fosterId}`);
}

async function updateFoster(fosterId: string, formData: FormData) {
  'use server';
  await requireOperator();
  const skillData: Record<string, boolean> = {};
  for (const key of ALL_SKILL_KEYS) skillData[key] = formData.get(key) === 'on';

  // Profile photo handling
  const validated = parseForm(fosterUpdateSchema, formData);
  const data: Record<string, unknown> = { ...validated, ...skillData };
  // Photo handling — a new upload wins over a remove request to avoid the
  // "both checked" race that orphans the freshly uploaded file.
  const photoFile = formData.get('photo');
  const wantsRemove = formData.get('removePhoto') === 'on';
  const hasNewPhoto = photoFile instanceof File && photoFile.size > 0;
  if (hasNewPhoto || wantsRemove) {
    const prev = await prisma.foster.findUnique({ where: { id: fosterId }, select: { photoUrl: true } });
    if (hasNewPhoto) {
      const saved = await saveUpload(photoFile as File, 'fosters', { allow: 'image' });
      if (saved) {
        if (prev?.photoUrl) await deleteUpload(prev.photoUrl);
        data.photoUrl = saved.url;
      }
    } else if (wantsRemove) {
      if (prev?.photoUrl) await deleteUpload(prev.photoUrl);
      data.photoUrl = null;
    }
  }

  await prisma.foster.update({ where: { id: fosterId }, data });
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
        {f.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={f.photoUrl}
            alt={f.name}
            className="h-16 w-16 rounded-full object-cover ring-2 ring-white shadow-md flex-shrink-0"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-white flex items-center justify-center text-xl font-bold flex-shrink-0">
            {f.name.charAt(0).toUpperCase()}
          </div>
        )}
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

      {/* Read-only assessment summary, computed server-side from saved values */}
      <Card>
        <H2>Foster Skill & Care Assessment</H2>
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <ScoreReadout
            title="Care Proficiency"
            score={clinicalScore(f as unknown as Record<string, unknown>)}
            max={MAX_CLINICAL}
            category={clinicalCategory(clinicalScore(f as unknown as Record<string, unknown>))}
            tone={clinicalCategoryTone(clinicalScore(f as unknown as Record<string, unknown>))}
          />
          <ScoreReadout
            title="Quality of Care"
            score={qualityScore(f as unknown as Record<string, unknown>)}
            max={MAX_QUALITY}
            category={qualityCategory(qualityScore(f as unknown as Record<string, unknown>))}
            tone={qualityCategoryTone(qualityScore(f as unknown as Record<string, unknown>))}
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {SKILL_TIERS.map(tier => {
            const earned = tier.items.reduce((acc, it) => acc + ((f as unknown as Record<string, unknown>)[it.key] ? tier.pointsPer : 0), 0);
            const max = tier.items.length * tier.pointsPer;
            return (
              <div key={tier.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">{tier.title}</span>
                  <span className="tabular-nums text-gray-600">{earned} / {max}</span>
                </div>
                <ul className="mt-2 text-xs space-y-0.5">
                  {tier.items.map(it => {
                    const checked = (f as unknown as Record<string, unknown>)[it.key];
                    return (
                      <li key={it.key} className={checked ? 'text-emerald-700' : 'text-gray-400'}>
                        {checked ? '✓' : '·'} {it.label}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Edit */}
      <Card>
        <H2>Foster record</H2>
        <form action={editAction} className="grid gap-3 sm:grid-cols-2 mt-3">
          <div className="sm:col-span-2 rounded-xl bg-gray-50 ring-1 ring-gray-200 p-3 flex items-center gap-3">
            {f.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.photoUrl} alt={f.name} className="h-14 w-14 rounded-full object-cover ring-2 ring-white shadow" />
            ) : (
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 text-white flex items-center justify-center text-lg font-bold">
                {f.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Profile photo</label>
              <input
                type="file"
                name="photo"
                accept="image/*"
                className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:text-teal-800 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-teal-100"
              />
              {f.photoUrl && (
                <label className="mt-2 flex items-center gap-1.5 text-xs text-red-700">
                  <input type="checkbox" name="removePhoto" className="rounded border-gray-300" />
                  Remove existing photo
                </label>
              )}
            </div>
          </div>
          <Field label="Name"><input name="name" defaultValue={f.name} className={inputClass} /></Field>
          <Field label="Phone"><input name="phone" defaultValue={f.phone ?? ''} className={inputClass} /></Field>
          <Field label="Email"><input name="email" defaultValue={f.email ?? ''} className={inputClass} /></Field>
          <Field label="Address"><input name="address" defaultValue={f.address ?? ''} className={inputClass} /></Field>
          <Field label="Date joined" className="sm:col-span-2">
            <PartialDatePicker
              name="joinedDate"
              defaultValue={{
                year: f.joinedDateYear,
                month: f.joinedDateMonth,
                day: f.joinedDateDay,
              }}
            />
            {formatPartialDate(f.joinedDateYear, f.joinedDateMonth, f.joinedDateDay) && (
              <p className="text-xs text-gray-500 mt-1">
                Currently: {formatPartialDate(f.joinedDateYear, f.joinedDateMonth, f.joinedDateDay)}
              </p>
            )}
          </Field>
          <Field label="Capacity" className="sm:col-span-2"><input type="number" name="capacity" defaultValue={f.capacity} className={inputClass} /></Field>
          {/*
            Rehab proficiency dropdown removed 2026-05-17 — the Skill & Care
            Assessment section below already covers this with finer granularity.
            The underlying `medicalSkill` column is intentionally retained
            in the schema so historical data is preserved.
          */}
          <div className="sm:col-span-2">
            <CheckRow name="longTermAble" label="Available for long-term foster" defaultChecked={f.longTermAble} />
          </div>

          {/* Transport — standalone section */}
          <div className="sm:col-span-2 rounded-xl bg-sky-50 ring-1 ring-sky-200 p-3 mt-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-sky-800 mb-2">Transport</h4>
            <CheckRow name="canTransportSelf" label="Can transport birds themselves" defaultChecked={f.canTransportSelf} />
          </div>

          {/* Tiered assessment with live scoring */}
          <div className="sm:col-span-2 mt-2">
            <h4 className="text-sm font-semibold mb-2">Foster Skill & Care Assessment</h4>
            <p className="text-xs text-gray-500 mb-3">Toggle skills below — scores update live. Save to persist.</p>
            <SkillAssessment
              initial={Object.fromEntries(ALL_SKILL_KEYS.map(k => [k, !!(f as unknown as Record<string, unknown>)[k]]))}
            />
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

function ScoreReadout({
  title, score, max, category, tone,
}: {
  title: string; score: number; max: number; category: string; tone: string;
}) {
  const pct = max ? Math.min(100, (score / max) * 100) : 0;
  const ring =
    tone === 'purple' ? 'ring-violet-200 bg-violet-50 text-violet-900'
    : tone === 'green' ? 'ring-emerald-200 bg-emerald-50 text-emerald-900'
    : tone === 'blue' ? 'ring-sky-200 bg-sky-50 text-sky-900'
    : tone === 'yellow' ? 'ring-yellow-200 bg-yellow-50 text-yellow-900'
    : 'ring-gray-200 bg-gray-50 text-gray-700';
  const bar =
    tone === 'purple' ? 'bg-violet-500'
    : tone === 'green' ? 'bg-emerald-500'
    : tone === 'blue' ? 'bg-sky-500'
    : tone === 'yellow' ? 'bg-yellow-500'
    : 'bg-gray-400';
  return (
    <div className={`rounded-2xl border ring-1 ${ring} p-4`}>
      <div className="flex items-end justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide opacity-70">{title}</h4>
          <div className="mt-1 text-3xl font-bold tabular-nums">
            {score}<span className="text-base font-normal opacity-50"> / {max}</span>
          </div>
        </div>
        <Pill tone={tone}>{category}</Pill>
      </div>
      <div className="mt-3 h-2 rounded-full bg-white/60 overflow-hidden">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
