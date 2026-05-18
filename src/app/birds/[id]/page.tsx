import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, H2, Card, Pill, StatusDot, Btn, Empty, Field, inputClass } from '@/components/ui';
import { STATUS_LABELS, STATUS_TONE, PRIORITY_TONE, BIRD_STATUSES, MEDICAL_PRIORITIES } from '@/lib/constants';
import { fmtDate, fmtDateTime, fmtRelative } from '@/lib/utils';
import { activeFosterWhere } from '@/lib/filters';
import { saveUpload, saveUploads, deleteUpload } from '@/lib/uploads';
import { getBirdSnapshot } from '@/lib/birdSnapshot';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import { requireOperator } from '@/lib/auth';
import { parseForm, birdUpdateSchema } from '@/lib/schemas';
import { PartialDatePicker } from '@/components/PartialDatePicker';
import { formatPartialDate } from '@/lib/partialDate';
import { WeightLog } from '@/components/WeightLog';

export const dynamic = 'force-dynamic';

async function updateBird(id: string, formData: FormData) {
  'use server';
  await requireOperator();
  const data = parseForm(birdUpdateSchema, formData);
  await prisma.bird.update({ where: { id }, data });
  redirect(`/birds/${id}`);
}

async function addWeightEntry(id: string, formData: FormData) {
  'use server';
  await requireOperator();
  const grams = Number(formData.get('grams'));
  if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) return;
  const dateStr = String(formData.get('measuredAt') || '');
  // Local-midnight to avoid the "clicked May 10, saved as May 9" UTC issue.
  const measuredAt = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
  const notes = String(formData.get('notes') || '').trim() || null;
  await prisma.weightEntry.create({
    data: { birdId: id, grams, measuredAt, notes },
  });
  // Mirror the latest reading onto Bird.weightGrams so list/dashboard
  // views that read the cached value keep working without a join.
  await refreshWeightCache(id);
  redirect(`/birds/${id}`);
}

async function deleteWeightEntry(id: string, formData: FormData) {
  'use server';
  await requireOperator();
  const entryId = String(formData.get('id') || '');
  if (!entryId) return;
  await prisma.weightEntry.deleteMany({ where: { id: entryId, birdId: id } });
  await refreshWeightCache(id);
  redirect(`/birds/${id}`);
}

/**
 * Recompute Bird.weightGrams from the latest WeightEntry row. Called
 * after every add / delete so the cached "current weight" never lies.
 */
async function refreshWeightCache(birdId: string) {
  const latest = await prisma.weightEntry.findFirst({
    where: { birdId },
    orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
  });
  await prisma.bird.update({
    where: { id: birdId },
    data: { weightGrams: latest ? latest.grams : null },
  });
}

async function addCaseNote(id: string, formData: FormData) {
  'use server';
  await requireOperator();
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
  await requireOperator();
  await prisma.bird.update({ where: { id }, data: { archivedAt: new Date(), deletedAt: null } });
  redirect(`/birds/${id}`);
}

async function softDeleteBird(id: string) {
  'use server';
  await requireOperator();
  await prisma.bird.update({ where: { id }, data: { deletedAt: new Date() } });
  redirect('/archive');
}

async function restoreBird(id: string) {
  'use server';
  await requireOperator();
  await prisma.bird.update({ where: { id }, data: { archivedAt: null, deletedAt: null } });
  redirect(`/birds/${id}`);
}

async function addMedication(id: string, formData: FormData) {
  'use server';
  await requireOperator();
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

async function uploadPhotos(id: string, formData: FormData) {
  'use server';
  await requireOperator();
  const category = String(formData.get('category') || 'general');
  const allow = category === 'vet' ? 'any' : 'image';
  const folder = category === 'health' ? 'health' : category === 'vet' ? 'vet' : 'birds';
  const notes = String(formData.get('notes') || '') || null;
  const caption = String(formData.get('caption') || '') || null;

  const files = formData.getAll('files');
  const saved = await saveUploads(files, folder, { allow });
  if (saved.length === 0) {
    redirect(`/birds/${id}`);
  }
  await prisma.$transaction(
    saved.map(s => prisma.photo.create({
      data: {
        birdId: id,
        url: s.url,
        category,
        kind: s.kind,
        caption,
        notes,
        originalName: s.originalName,
        mimeType: s.mimeType,
      },
    })),
  );
  redirect(`/birds/${id}`);
}

async function setProfilePhoto(id: string, photoId: string) {
  'use server';
  await requireOperator();
  // Verify the photo belongs to the bird before mutating. Without this, a
  // crafted form post could flip the profile flag on someone else's photo.
  const photo = await prisma.photo.findUnique({ where: { id: photoId }, select: { birdId: true } });
  if (!photo || photo.birdId !== id) {
    redirect(`/birds/${id}`);
  }
  await prisma.$transaction([
    prisma.photo.updateMany({ where: { birdId: id }, data: { isProfile: false } }),
    prisma.photo.update({ where: { id: photoId }, data: { isProfile: true } }),
  ]);
  redirect(`/birds/${id}`);
}

async function deletePhoto(id: string, photoId: string) {
  'use server';
  await requireOperator();
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (photo && photo.birdId === id) {
    await deleteUpload(photo.url);
    await prisma.photo.delete({ where: { id: photoId } });
  }
  redirect(`/birds/${id}`);
}

export default async function BirdDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photo?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const lightboxId = sp.photo || null;
  const bird = await prisma.bird.findUnique({
    where: { id },
    include: {
      foster: true,
      medications: { orderBy: { startDate: 'desc' } },
      placements: { include: { foster: true }, orderBy: { startDate: 'desc' } },
      dailyUpdates: { orderBy: { createdAt: 'desc' }, take: 10, include: { foster: true, photos: true } },
      caseNotes: { orderBy: { createdAt: 'desc' } },
      vetVisits: { orderBy: { visitDate: 'desc' } },
      requests: { orderBy: { createdAt: 'desc' }, include: { foster: true } },
      photos: { orderBy: [{ isProfile: 'desc' }, { createdAt: 'desc' }] },
      weightLog: { orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }] },
    },
  });
  if (!bird) notFound();

  // Partition photos by category for the three gallery sections.
  const generalPhotos = bird.photos.filter(p => p.category === 'general');
  const healthPhotos  = bird.photos.filter(p => p.category === 'health');
  const vetPhotos     = bird.photos.filter(p => p.category === 'vet');
  const profilePhoto  = bird.photos.find(p => p.isProfile && p.kind === 'image') ?? null;

  // Snapshot: upcoming events/transports/vet visits + meds needing refill.
  const snapshot = await getBirdSnapshot(id);

  // Lightbox setup: which photo is open, plus prev/next navigation within
  // the same category (so arrows feel natural).
  const lightboxPhoto = lightboxId ? bird.photos.find(p => p.id === lightboxId) ?? null : null;
  let lightboxPrevId: string | null = null;
  let lightboxNextId: string | null = null;
  if (lightboxPhoto) {
    const peers =
      lightboxPhoto.category === 'health' ? healthPhotos
      : lightboxPhoto.category === 'vet' ? vetPhotos
      : generalPhotos;
    const idx = peers.findIndex(p => p.id === lightboxPhoto.id);
    if (idx > 0) lightboxPrevId = peers[idx - 1].id;
    if (idx >= 0 && idx < peers.length - 1) lightboxNextId = peers[idx + 1].id;
  }

  const isArchived = !!bird.archivedAt;
  const isDeleted = !!bird.deletedAt;

  const fosters = await prisma.foster.findMany({ where: activeFosterWhere, orderBy: { name: 'asc' } });
  const updateAction = updateBird.bind(null, bird.id);
  const noteAction = addCaseNote.bind(null, bird.id);
  const medAction = addMedication.bind(null, bird.id);
  const weightAddAction = addWeightEntry.bind(null, bird.id);
  const weightDeleteAction = deleteWeightEntry.bind(null, bird.id);
  const foundDateStr = formatPartialDate(
    bird.foundDateYear,
    bird.foundDateMonth,
    bird.foundDateDay,
  );
  const archiveAction = archiveBird.bind(null, bird.id);
  const deleteAction = softDeleteBird.bind(null, bird.id);
  const restoreAction = restoreBird.bind(null, bird.id);
  const photoUploadAction = uploadPhotos.bind(null, bird.id);

  return (
    <div className="space-y-4">
      {lightboxPhoto && (
        <PhotoLightbox
          closeHref={`/birds/${bird.id}`}
          imageUrl={lightboxPhoto.url}
          alt={lightboxPhoto.caption ?? bird.name}
          caption={lightboxPhoto.caption}
          notes={lightboxPhoto.notes}
          category={lightboxPhoto.category as 'general' | 'health' | 'vet'}
          isProfile={lightboxPhoto.isProfile}
          isImage={lightboxPhoto.kind === 'image'}
          meta={{
            createdAt: fmtDateTime(lightboxPhoto.createdAt),
            mimeType: lightboxPhoto.mimeType,
            originalName: lightboxPhoto.originalName,
          }}
          prevHref={lightboxPrevId ? `/birds/${bird.id}?photo=${lightboxPrevId}` : null}
          nextHref={lightboxNextId ? `/birds/${bird.id}?photo=${lightboxNextId}` : null}
          setProfileForm={
            lightboxPhoto.kind === 'image' && !lightboxPhoto.isProfile ? (
              <form action={async () => { 'use server'; await requireOperator(); await setProfilePhoto(bird.id, lightboxPhoto.id); }}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5"
                >
                  ★ Set as profile
                </button>
              </form>
            ) : lightboxPhoto.isProfile ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-teal-50 text-teal-800 ring-1 ring-teal-200 text-xs font-medium px-3 py-1.5">
                ★ Current profile
              </span>
            ) : null
          }
          deleteForm={
            <form action={async () => { 'use server'; await requireOperator(); await deletePhoto(bird.id, lightboxPhoto.id); }}>
              <button
                type="submit"
                className="text-xs text-red-600 hover:text-red-800 hover:underline"
              >
                Delete
              </button>
            </form>
          }
        />
      )}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-4">
          {profilePhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profilePhoto.url}
              alt={bird.name}
              className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white shadow-md flex-shrink-0"
            />
          ) : (
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 text-white flex items-center justify-center text-2xl font-bold flex-shrink-0">
              🕊️
            </div>
          )}
          <div>
          <Link href="/birds" className="text-sm text-teal-700 hover:underline">← Birds</Link>
          <div className="flex items-center gap-3 mt-1">
            <StatusDot tone={STATUS_TONE[bird.status] || 'gray'} size="lg" />
            <H1>{bird.name}</H1>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {isDeleted && <Pill tone="red">deleted</Pill>}
            {isArchived && !isDeleted && <Pill tone="gray">archived</Pill>}
            <Pill tone={STATUS_TONE[bird.status] || 'gray'}>{STATUS_LABELS[bird.status] ?? bird.status}</Pill>
            {bird.currentlyQuarantined && <Pill tone="yellow">🚫 quarantined</Pill>}
            {bird.clearedForIntegration && <Pill tone="green">✓ cleared for integration</Pill>}
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

      {/* Snapshot — upcoming care + meds to refill */}
      <Card tone={(snapshot.upcoming.length || snapshot.refills.length) ? 'blue' : 'gray'}>
        <div className="flex items-center justify-between mb-3">
          <H2>Care snapshot</H2>
          <span className="text-xs text-gray-500">next 30 days</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {/* Upcoming */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">Upcoming</h3>
              <Pill tone={snapshot.upcoming.length ? 'blue' : 'gray'}>{snapshot.upcoming.length}</Pill>
            </div>
            {snapshot.upcoming.length === 0 ? (
              <p className="text-xs text-gray-500">Nothing scheduled.</p>
            ) : (
              <ul className="space-y-1.5">
                {snapshot.upcoming.slice(0, 5).map(it => (
                  <li key={`${it.kind}_${it.id}`} className="text-xs flex items-center gap-2">
                    <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] flex-shrink-0 ${
                      it.kind === 'transport' ? 'bg-orange-100 text-orange-800'
                      : it.kind === 'vet' ? 'bg-sky-100 text-sky-800'
                      : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {it.kind === 'transport' ? '🚚' : it.kind === 'vet' ? '⚕️' : '📅'}
                    </span>
                    <Link href={it.href} className="flex-1 min-w-0 hover:underline">
                      <span className="font-medium text-gray-800 truncate block">{it.title}</span>
                      <span className="text-[10px] text-gray-500">{fmtDateTime(it.when)}{it.detail ? ` · ${it.detail}` : ''}</span>
                    </Link>
                  </li>
                ))}
                {snapshot.upcoming.length > 5 && (
                  <li className="text-[11px] text-gray-500">+{snapshot.upcoming.length - 5} more</li>
                )}
              </ul>
            )}
          </div>
          {/* Refills */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">Meds to refill</h3>
              <Pill tone={snapshot.refills.some(r => r.daysUntil <= 0) ? 'red' : snapshot.refills.length ? 'yellow' : 'gray'}>
                {snapshot.refills.length}
              </Pill>
            </div>
            {snapshot.refills.length === 0 ? (
              <p className="text-xs text-gray-500">No refills due.</p>
            ) : (
              <ul className="space-y-1.5">
                {snapshot.refills.slice(0, 5).map(r => (
                  <li key={r.id} className="text-xs flex items-center gap-2">
                    <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] flex-shrink-0 ${
                      r.daysUntil <= 0 ? 'bg-red-100 text-red-800'
                      : r.daysUntil <= 3 ? 'bg-orange-100 text-orange-800'
                      : 'bg-yellow-100 text-yellow-800'
                    }`}>💊</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{r.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {r.daysUntil <= 0
                          ? <span className="text-red-700 font-medium">overdue {-r.daysUntil}d</span>
                          : r.daysUntil === 0 ? 'today'
                          : r.daysUntil === 1 ? 'tomorrow'
                          : `in ${r.daysUntil}d`}
                        {' · runout '}{fmtDate(r.runout)}
                      </div>
                    </div>
                  </li>
                ))}
                {snapshot.refills.length > 5 && (
                  <li className="text-[11px] text-gray-500">+{snapshot.refills.length - 5} more</li>
                )}
              </ul>
            )}
          </div>
        </div>
      </Card>

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
              {/*
                Quarantine + integration tracking. Lives immediately below the
                Status dropdown so the operator sees and edits both axes at
                once. "Currently Quarantined" replaces the old `quarantine`
                status value; "Cleared for Integration" is the green-light
                flag for moving the bird into a shared flight.
              */}
              <Field label="Projected to be cleared" hint="Year is enough. Add month and day only if you know them.">
                <PartialDatePicker
                  name="projectedCleared"
                  defaultValue={{
                    year: bird.projectedClearedYear,
                    month: bird.projectedClearedMonth,
                    day: bird.projectedClearedDay,
                  }}
                />
                {formatPartialDate(
                  bird.projectedClearedYear,
                  bird.projectedClearedMonth,
                  bird.projectedClearedDay,
                ) && (
                  <p className="text-xs text-gray-500 mt-1">
                    Currently: {formatPartialDate(
                      bird.projectedClearedYear,
                      bird.projectedClearedMonth,
                      bird.projectedClearedDay,
                    )}
                  </p>
                )}
              </Field>
              <div className="sm:col-span-2 grid sm:grid-cols-2 gap-2">
                <label
                  className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ring-1 transition cursor-pointer ${
                    bird.currentlyQuarantined
                      ? 'bg-yellow-50 text-yellow-900 ring-yellow-300'
                      : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    name="currentlyQuarantined"
                    defaultChecked={bird.currentlyQuarantined}
                    className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                  />
                  <span className="font-medium">Currently Quarantined</span>
                </label>
                <label
                  className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ring-1 transition cursor-pointer ${
                    bird.clearedForIntegration
                      ? 'bg-emerald-50 text-emerald-900 ring-emerald-300'
                      : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    name="clearedForIntegration"
                    defaultChecked={bird.clearedForIntegration}
                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="font-medium">Cleared for Integration</span>
                </label>
              </div>
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
              <Field label="Current weight">
                <div className="flex items-center h-[38px] px-3 text-sm text-gray-700">
                  {bird.weightGrams != null ? (
                    <span>
                      <span className="font-medium">{bird.weightGrams.toFixed(1)} g</span>
                      <span className="text-xs text-gray-500 ml-2">(from log)</span>
                    </span>
                  ) : (
                    <span className="text-gray-400">No weight logged yet</span>
                  )}
                </div>
              </Field>
              <Field label="Date found" className="sm:col-span-2">
                <PartialDatePicker
                  name="foundDate"
                  defaultValue={{
                    year: bird.foundDateYear,
                    month: bird.foundDateMonth,
                    day: bird.foundDateDay,
                  }}
                />
                {foundDateStr && (
                  <p className="text-xs text-gray-500 mt-1">Currently: {foundDateStr}</p>
                )}
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

          {/* Weight log */}
          <Card>
            <div className="flex items-center justify-between">
              <H2>Weight log</H2>
              {bird.weightGrams != null && (
                <span className="text-xs text-gray-500">
                  Latest: <strong className="text-gray-700">{bird.weightGrams.toFixed(1)} g</strong>
                </span>
              )}
            </div>
            <WeightLog
              entries={bird.weightLog}
              addAction={weightAddAction}
              deleteAction={weightDeleteAction}
            />
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
                    {u.photos && u.photos.length > 0 && (
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {u.photos.map(p => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="block">
                            <img
                              src={p.url}
                              alt={p.caption ?? 'daily update photo'}
                              className="h-20 w-20 rounded-lg object-cover ring-1 ring-gray-200 hover:ring-teal-400 transition"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Photos gallery */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <H2>Photos</H2>
              <Pill tone={generalPhotos.length ? 'blue' : 'gray'}>{generalPhotos.length}</Pill>
            </div>
            <details className="mb-3">
              <summary className="cursor-pointer text-sm text-teal-700">+ Upload photos</summary>
              <form action={photoUploadAction} className="mt-3 space-y-2" encType="multipart/form-data">
                <input type="hidden" name="category" value="general" />
                <input
                  type="file"
                  name="files"
                  accept="image/*"
                  multiple
                  required
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:text-teal-800 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-teal-100"
                />
                <input name="caption" placeholder="Caption (optional)" className={inputClass} />
                <Btn type="submit" variant="primary">Upload</Btn>
              </form>
            </details>
            {generalPhotos.length === 0 ? (
              <Empty msg="No photos yet. Upload some above." />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {generalPhotos.map(p => (
                  <div key={p.id} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <Link href={`/birds/${bird.id}?photo=${p.id}`}>
                      <img
                        src={p.url}
                        alt={p.caption ?? 'bird photo'}
                        className={`w-full h-32 object-cover rounded-lg ring-1 transition cursor-zoom-in ${
                          p.isProfile ? 'ring-2 ring-teal-500' : 'ring-gray-200 hover:ring-teal-400'
                        }`}
                      />
                    </Link>
                    {p.isProfile && (
                      <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded-full bg-teal-600 text-white text-[10px] font-semibold px-2 py-0.5">★ profile</span>
                    )}
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      {!p.isProfile && (
                        <form action={async () => { 'use server'; await requireOperator(); await setProfilePhoto(bird.id, p.id); }}>
                          <button type="submit" title="Set as profile" className="h-6 w-6 rounded-full bg-white/90 text-teal-700 text-xs shadow ring-1 ring-gray-200 hover:bg-white">★</button>
                        </form>
                      )}
                      <form action={async () => { 'use server'; await requireOperator(); await deletePhoto(bird.id, p.id); }}>
                        <button type="submit" title="Delete" className="h-6 w-6 rounded-full bg-white/90 text-red-600 text-xs shadow ring-1 ring-gray-200 hover:bg-white">✕</button>
                      </form>
                    </div>
                    {p.caption && <p className="mt-1 text-[10px] text-gray-600 line-clamp-2">{p.caption}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Health records */}
          <Card tone={healthPhotos.length ? 'orange' : 'gray'}>
            <div className="flex items-center justify-between mb-3">
              <H2>Health records</H2>
              <Pill tone={healthPhotos.length ? 'orange' : 'gray'}>{healthPhotos.length}</Pill>
            </div>
            <p className="text-xs text-gray-600 mb-3">Photos with medical significance — injuries, X-rays, wound progress — with notes.</p>
            <details className="mb-3">
              <summary className="cursor-pointer text-sm text-teal-700">+ Add health record</summary>
              <form action={photoUploadAction} className="mt-3 space-y-2" encType="multipart/form-data">
                <input type="hidden" name="category" value="health" />
                <input
                  type="file"
                  name="files"
                  accept="image/*"
                  multiple
                  required
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:text-orange-800 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-orange-100"
                />
                <input name="caption" placeholder="Short caption (e.g. 'left foot, day 3')" className={inputClass} />
                <textarea name="notes" rows={3} placeholder="Medical notes — what's significant about this image?" className={inputClass} />
                <Btn type="submit" variant="primary">Add health record</Btn>
              </form>
            </details>
            {healthPhotos.length === 0 ? (
              <Empty msg="No health records yet." />
            ) : (
              <ul className="space-y-3">
                {healthPhotos.map(p => (
                  <li key={p.id} className="flex gap-3 rounded-lg ring-1 ring-orange-100 bg-orange-50/40 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <Link href={`/birds/${bird.id}?photo=${p.id}`} className="flex-shrink-0">
                      <img src={p.url} alt={p.caption ?? 'health record'} className="h-24 w-24 object-cover rounded-md ring-1 ring-gray-200 hover:ring-teal-400 transition cursor-zoom-in" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-gray-500">{fmtDateTime(p.createdAt)}</div>
                        <form action={async () => { 'use server'; await requireOperator(); await deletePhoto(bird.id, p.id); }}>
                          <button type="submit" className="text-xs text-red-600 hover:underline">Delete</button>
                        </form>
                      </div>
                      {p.caption && <div className="text-sm font-medium mt-0.5">{p.caption}</div>}
                      {p.notes && <p className="text-xs text-gray-700 mt-1 whitespace-pre-wrap">{p.notes}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Veterinary paperwork */}
          <Card tone={vetPhotos.length ? 'blue' : 'gray'}>
            <div className="flex items-center justify-between mb-3">
              <H2>Veterinary paperwork</H2>
              <Pill tone={vetPhotos.length ? 'blue' : 'gray'}>{vetPhotos.length}</Pill>
            </div>
            <p className="text-xs text-gray-600 mb-3">Documents and images from the vet — invoices, prescriptions, lab results, intake forms.</p>
            <details className="mb-3">
              <summary className="cursor-pointer text-sm text-teal-700">+ Upload document or image</summary>
              <form action={photoUploadAction} className="mt-3 space-y-2" encType="multipart/form-data">
                <input type="hidden" name="category" value="vet" />
                <input
                  type="file"
                  name="files"
                  accept="image/*,application/pdf,.doc,.docx,.txt"
                  multiple
                  required
                  className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:text-sky-800 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-sky-100"
                />
                <input name="caption" placeholder="Title (e.g. 'Q1 invoice', 'X-ray report')" className={inputClass} />
                <textarea name="notes" rows={2} placeholder="Notes (optional)" className={inputClass} />
                <Btn type="submit" variant="primary">Upload</Btn>
              </form>
            </details>
            {vetPhotos.length === 0 ? (
              <Empty msg="No vet paperwork yet." />
            ) : (
              <ul className="space-y-2">
                {vetPhotos.map(p => (
                  <li key={p.id} className="flex items-center gap-3 rounded-lg ring-1 ring-sky-100 bg-sky-50/40 p-2">
                    {p.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <Link href={`/birds/${bird.id}?photo=${p.id}`} className="flex-shrink-0">
                        <img src={p.url} alt={p.caption ?? 'vet doc'} className="h-16 w-16 object-cover rounded-md ring-1 ring-gray-200 cursor-zoom-in" />
                      </Link>
                    ) : (
                      <Link href={`/birds/${bird.id}?photo=${p.id}`} className="h-16 w-16 rounded-md bg-white ring-1 ring-gray-200 flex items-center justify-center text-2xl flex-shrink-0 cursor-pointer hover:ring-teal-400">📄</Link>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {p.caption || p.originalName || 'Document'}
                        </a>
                      </div>
                      <div className="text-xs text-gray-500">{fmtDateTime(p.createdAt)}{p.mimeType ? ` · ${p.mimeType}` : ''}</div>
                      {p.notes && <p className="text-xs text-gray-700 mt-0.5 line-clamp-2">{p.notes}</p>}
                    </div>
                    <form action={async () => { 'use server'; await requireOperator(); await deletePhoto(bird.id, p.id); }}>
                      <button type="submit" className="text-xs text-red-600 hover:underline">Delete</button>
                    </form>
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
