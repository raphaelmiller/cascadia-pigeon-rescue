import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, H2, Card, Pill, StatusDot, Btn, Empty, Field, inputClass } from '@/components/ui';
import { STATUS_LABELS, STATUS_TONE, PRIORITY_TONE, BIRD_STATUSES, MEDICAL_PRIORITIES } from '@/lib/constants';
import { fmtDate, fmtDateTime, fmtRelative } from '@/lib/utils';
import { activeFosterWhere } from '@/lib/filters';

export const dynamic = 'force-dynamic';

async function updateBird(id: string, formData: FormData) {
  'use server';
  await prisma.bird.update({
    where: { id },
    data: {
      name: String(formData.get('name') || '').trim() || 'Unnamed',
      status: String(formData.get('status') || 'needs_intake'),
      medicalPriority: String(formData.get('medicalPriority') || 'none'),
      species: String(formData.get('species') || '') || null,
      age: String(formData.get('age') || '') || null,
      sex: String(formData.get('sex') || '') || null,
      weightGrams: formData.get('weightGrams') ? Number(formData.get('weightGrams')) : null,
      primaryDiagnosis: String(formData.get('primaryDiagnosis') || '') || null,
      medicalNotes: String(formData.get('medicalNotes') || '') || null,
      dietNotes: String(formData.get('dietNotes') || '') || null,
      behaviorNotes: String(formData.get('behaviorNotes') || '') || null,
      specialHandling: String(formData.get('specialHandling') || '') || null,
      fosterId: String(formData.get('fosterId') || '') || null,
    },
  });
  redirect(`/birds/${id}`);
}

async function addCaseNote(id: string, formData: FormData) {
  'use server';
  const body = String(formData.get('body') || '').trim();
  if (!body) return;
  await prisma.caseNote.create({
    data: {
      birdId: id,
      body,
      author: String(formData.get('author') || '') || null,
    },
  });
  redirect(`/birds/${id}`);
}

async function archiveBird(id: string) {
  'use server';
  await prisma.bird.update({ where: { id }, data: { archivedAt: new Date(), deletedAt: null } });
  redirect(`/birds/${id}`);
}

async function softDeleteBird(id: string) {
  'use server';
  await prisma.bird.update({ where: { id }, data: { deletedAt: new Date() } });
  redirect('/archive');
}

async function restoreBird(id: string) {
  'use server';
  await prisma.bird.update({ where: { id }, data: { archivedAt: null, deletedAt: null } });
  redirect(`/birds/${id}`);
}

async function addMedication(id: string, formData: FormData) {
  'use server';
  const name = String(formData.get('name') || '').trim();
  if (!name) return;
  const days = formData.get('daysSupplied') ? Number(formData.get('daysSupplied')) : null;
  await prisma.medication.create({
    data: {
      birdId: id,
      name,
      dose: String(formData.get('dose') || '') || null,
      route: String(formData.get('route') || '') || null,
      frequency: String(formData.get('frequency') || '') || null,
      daysSupplied: days,
      notes: String(formData.get('notes') || '') || null,
    },
  });
  redirect(`/birds/${id}`);
}

export default async function BirdDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bird = await prisma.bird.findUnique({
    where: { id },
    include: {
      foster: true,
      medications: { orderBy: { startDate: 'desc' } },
      placements: { include: { foster: true }, orderBy: { startDate: 'desc' } },
      dailyUpdates: { orderBy: { createdAt: 'desc' }, take: 10, include: { foster: true } },
      caseNotes: { orderBy: { createdAt: 'desc' } },
      vetVisits: { orderBy: { visitDate: 'desc' } },
      requests: { orderBy: { createdAt: 'desc' }, include: { foster: true } },
      photos: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!bird) notFound();

  const isArchived = !!bird.archivedAt;
  const isDeleted = !!bird.deletedAt;

  const fosters = await prisma.foster.findMany({ where: activeFosterWhere, orderBy: { name: 'asc' } });
  const updateAction = updateBird.bind(null, bird.id);
  const noteAction = addCaseNote.bind(null, bird.id);
  const medAction = addMedication.bind(null, bird.id);
  const archiveAction = archiveBird.bind(null, bird.id);
  const deleteAction = softDeleteBird.bind(null, bird.id);
  const restoreAction = restoreBird.bind(null, bird.id);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/birds" className="text-sm text-teal-700 hover:underline">← Birds</Link>
          <div className="flex items-center gap-3 mt-1">
            <StatusDot tone={STATUS_TONE[bird.status] || 'gray'} size="lg" />
            <H1>{bird.name}</H1>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {isDeleted && <Pill tone="red">deleted</Pill>}
            {isArchived && !isDeleted && <Pill tone="gray">archived</Pill>}
            <Pill tone={STATUS_TONE[bird.status] || 'gray'}>{STATUS_LABELS[bird.status]}</Pill>
            {bird.medicalPriority !== 'none' && <Pill tone={PRIORITY_TONE[bird.medicalPriority]}>{bird.medicalPriority}</Pill>}
            {bird.species && <Pill>{bird.species}</Pill>}
            {bird.age && <Pill>age {bird.age}</Pill>}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Intake {fmtDate(bird.intakeDate)} · last updated {fmtRelative(bird.updatedAt)}
            {bird.archivedAt && ` · archived ${fmtRelative(bird.archivedAt)}`}
            {bird.deletedAt && ` · deleted ${fmtRelative(bird.deletedAt)}`}
          </p>
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

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Edit */}
          <Card>
            <H2>Bird record</H2>
            <form action={updateAction} className="grid gap-3 sm:grid-cols-2 mt-3">
              <Field label="Name">
                <input name="name" defaultValue={bird.name} className={inputClass} />
              </Field>
              <Field label="Status">
                <select name="status" defaultValue={bird.status} className={inputClass}>
                  {BIRD_STATUSES.map(s => (<option key={s} value={s}>{STATUS_LABELS[s]}</option>))}
                </select>
              </Field>
              <Field label="Species">
                <input name="species" defaultValue={bird.species ?? ''} className={inputClass} />
              </Field>
              <Field label="Age">
                <input name="age" defaultValue={bird.age ?? ''} className={inputClass} />
              </Field>
              <Field label="Sex">
                <select name="sex" defaultValue={bird.sex ?? ''} className={inputClass}>
                  <option value="">Unknown</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </Field>
              <Field label="Weight (g)">
                <input type="number" step="0.1" name="weightGrams" defaultValue={bird.weightGrams ?? ''} className={inputClass} />
              </Field>
              <Field label="Medical priority">
                <select name="medicalPriority" defaultValue={bird.medicalPriority} className={inputClass}>
                  {MEDICAL_PRIORITIES.map(p => (<option key={p} value={p}>{p}</option>))}
                </select>
              </Field>
              <Field label="Foster">
                <select name="fosterId" defaultValue={bird.fosterId ?? ''} className={inputClass}>
                  <option value="">— Unassigned —</option>
                  {fosters.map(f => (<option key={f.id} value={f.id}>{f.name}</option>))}
                </select>
              </Field>
              <Field label="Primary diagnosis" className="sm:col-span-2">
                <input name="primaryDiagnosis" defaultValue={bird.primaryDiagnosis ?? ''} className={inputClass} />
              </Field>
              <Field label="Medical notes" className="sm:col-span-2">
                <textarea name="medicalNotes" rows={2} defaultValue={bird.medicalNotes ?? ''} className={inputClass} />
              </Field>
              <Field label="Diet notes" className="sm:col-span-2">
                <textarea name="dietNotes" rows={2} defaultValue={bird.dietNotes ?? ''} className={inputClass} />
              </Field>
              <Field label="Behavior notes" className="sm:col-span-2">
                <textarea name="behaviorNotes" rows={2} defaultValue={bird.behaviorNotes ?? ''} className={inputClass} />
              </Field>
              <Field label="Special handling" className="sm:col-span-2">
                <textarea name="specialHandling" rows={2} defaultValue={bird.specialHandling ?? ''} className={inputClass} />
              </Field>
              <div className="sm:col-span-2">
                <Btn type="submit" variant="primary">Save changes</Btn>
              </div>
            </form>
          </Card>

          {/* Medications */}
          <Card tone={bird.medications.length ? 'yellow' : 'gray'}>
            <H2>Medications</H2>
            {bird.medications.length === 0 ? (
              <Empty msg="No medications on file." />
            ) : (
              <ul className="divide-y divide-gray-100 mt-3">
                {bird.medications.map(m => (
                  <li key={m.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{m.name}</div>
                      <span className="text-xs text-gray-500">{fmtDate(m.startDate)} →</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      {m.dose ? `${m.dose} ` : ''}{m.route ? `· ${m.route} ` : ''}{m.frequency ? `· ${m.frequency} ` : ''}
                      {m.daysSupplied ? `· ${m.daysSupplied}d supply` : ''}
                    </div>
                    {m.notes && <div className="text-xs text-gray-500 mt-0.5">{m.notes}</div>}
                  </li>
                ))}
              </ul>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-teal-700">+ Add medication</summary>
              <form action={medAction} className="grid gap-3 sm:grid-cols-2 mt-3">
                <Field label="Name *"><input required name="name" className={inputClass} /></Field>
                <Field label="Dose"><input name="dose" className={inputClass} placeholder="e.g. 0.05 mL" /></Field>
                <Field label="Route">
                  <select name="route" defaultValue="PO" className={inputClass}>
                    <option>PO</option><option>SC</option><option>IM</option><option>topical</option><option>nebulized</option>
                  </select>
                </Field>
                <Field label="Frequency"><input name="frequency" className={inputClass} placeholder="BID, TID, q12h…" /></Field>
                <Field label="Days supplied"><input type="number" name="daysSupplied" className={inputClass} /></Field>
                <Field label="Notes" className="sm:col-span-2"><textarea name="notes" rows={2} className={inputClass} /></Field>
                <div className="sm:col-span-2"><Btn type="submit" variant="primary">Add medication</Btn></div>
              </form>
            </details>
          </Card>

          {/* Daily updates */}
          <Card>
            <H2>Daily updates</H2>
            {bird.dailyUpdates.length === 0 ? (
              <Empty msg="No daily updates yet." />
            ) : (
              <ul className="divide-y divide-gray-100 mt-3">
                {bird.dailyUpdates.map(u => (
                  <li key={u.id} className="py-2.5">
                    <div className="text-xs text-gray-500">{fmtDateTime(u.createdAt)} · {u.foster.name}</div>
                    <div className="text-sm mt-0.5"><strong>Health:</strong> {u.healthStatus || '—'}</div>
                    <div className="text-xs text-gray-600">
                      eat/drink {u.eatingDrinking || '—'} · poop {u.poopQuality || '—'} · energy {u.energyLevel || '—'} · stress {u.stressLevel ?? '—'}
                    </div>
                    {u.concerns && <div className="text-sm mt-1 text-orange-700">⚠ {u.concerns}</div>}
                    {u.notes && <div className="text-sm text-gray-600 mt-0.5">{u.notes}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {/* Case notes */}
          <Card>
            <H2>Case notes</H2>
            <form action={noteAction} className="mt-3 space-y-2">
              <input name="author" placeholder="Author (optional)" className={inputClass} />
              <textarea name="body" required rows={3} placeholder="Note…" className={inputClass} />
              <Btn type="submit" variant="primary">+ Add note</Btn>
            </form>
            <ul className="divide-y divide-gray-100 mt-4">
              {bird.caseNotes.length === 0 && <Empty msg="No case notes yet." />}
              {bird.caseNotes.map(n => (
                <li key={n.id} className="py-2.5">
                  <div className="text-xs text-gray-500">{fmtDateTime(n.createdAt)}{n.author ? ` · ${n.author}` : ''}</div>
                  <div className="text-sm whitespace-pre-wrap mt-0.5">{n.body}</div>
                </li>
              ))}
            </ul>
          </Card>

          {/* Placement history */}
          <Card>
            <H2>Placements</H2>
            {bird.placements.length === 0 ? (
              <Empty msg="No placement history." />
            ) : (
              <ul className="divide-y divide-gray-100 mt-3">
                {bird.placements.map(p => (
                  <li key={p.id} className="py-2.5 text-sm">
                    <div className="font-medium">{p.foster.name}</div>
                    <div className="text-xs text-gray-500">
                      {fmtDate(p.startDate)} → {p.endDate ? fmtDate(p.endDate) : 'present'}
                      {p.reason ? ` · ${p.reason}` : ''}
                    </div>
                    {p.notes && <div className="text-xs text-gray-600 mt-0.5">{p.notes}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Requests */}
          {bird.requests.length > 0 && (
            <Card>
              <H2>Linked requests</H2>
              <ul className="divide-y divide-gray-100 mt-3">
                {bird.requests.map(r => (
                  <li key={r.id} className="py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Pill>{r.type}</Pill>
                      <span className="text-xs text-gray-500">{r.foster.name}</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5 line-clamp-2">{r.description}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
