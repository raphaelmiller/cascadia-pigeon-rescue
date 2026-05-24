// PR D: Rescue case detail page.
//
// Shows the case, the timeline of attempts/observations, all photos,
// status workflow buttons, and an inline "+ Add update" form. The
// "Mark rescued" action auto-creates a Bird record pre-populated from
// the case (description -> name, location -> foundLocation, reporter
// info -> finder info) and links it via rescuedBirdId.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, H2, Card, Pill, Btn, Field, inputClass, Empty } from '@/components/ui';
import { fmtDateTime, fmtRelative } from '@/lib/utils';
import { requireOperator } from '@/lib/auth';
import { saveUploads } from '@/lib/uploads';
import { reverseResolution } from '@/lib/volunteer/job-resolution';
import {
  RESCUE_CASE_STATUS_LABEL,
  RESCUE_CASE_STATUS_TONE,
} from '@/lib/constants';

export const dynamic = 'force-dynamic';

// ---------- Server actions ----------

async function addUpdate(caseId: string, formData: FormData) {
  'use server';
  await requireOperator();
  const text = String(formData.get('text') || '').trim();
  if (!text) return;
  const authorName = String(formData.get('authorName') || '').trim() || null;
  const attemptedAtRaw = String(formData.get('attemptedAt') || '').trim();
  await prisma.rescueCaseUpdate.create({
    data: {
      caseId,
      text,
      authorName,
      ...(attemptedAtRaw ? { attemptedAt: new Date(attemptedAtRaw) } : {}),
    },
  });
  redirect(`/rescue/cases/${caseId}`);
}

async function addPhotos(caseId: string, formData: FormData) {
  'use server';
  await requireOperator();
  const photoFiles = formData.getAll('photos');
  if (photoFiles.length === 0) return;
  const saved = await saveUploads(photoFiles, 'rescue-cases', { allow: 'image' });
  if (saved.length > 0) {
    await prisma.rescueCasePhoto.createMany({
      data: saved.map((s) => ({ caseId, url: s.url, caption: null })),
    });
  }
  redirect(`/rescue/cases/${caseId}`);
}

async function updateCase(caseId: string, formData: FormData) {
  'use server';
  await requireOperator();
  const data: Record<string, unknown> = {
    birdDescription: String(formData.get('birdDescription') || '').trim() || null,
    issue: String(formData.get('issue') || '').trim() || null,
    location: String(formData.get('location') || '').trim() || null,
    address: String(formData.get('address') || '').trim() || null,
    reporterName: String(formData.get('reporterName') || '').trim() || null,
    reporterPhone: String(formData.get('reporterPhone') || '').trim() || null,
    reporterContact: String(formData.get('reporterContact') || '').trim() || null,
    notes: String(formData.get('notes') || '').trim() || null,
    assignedVolunteerId: String(formData.get('assignedVolunteerId') || '') || null,
    lastSeenLocation: String(formData.get('lastSeenLocation') || '').trim() || null,
    lastSeenNotes: String(formData.get('lastSeenNotes') || '').trim() || null,
  };
  const lastSeenAtRaw = String(formData.get('lastSeenAt') || '').trim();
  if (lastSeenAtRaw) data.lastSeenAt = new Date(lastSeenAtRaw);
  else data.lastSeenAt = null;

  await prisma.rescueCase.update({ where: { id: caseId }, data });
  redirect(`/rescue/cases/${caseId}`);
}

async function setStatus(caseId: string, status: string) {
  'use server';
  await requireOperator();
  // PR H: every status change writes the resolution audit fields too so
  // the undo flow has something to look at. Setting a non-terminal status
  // (needs_rescue) clears them.
  const isTerminal = ['rescued', 'escaped_flew_away', 'closed_unable'].includes(status);
  await prisma.rescueCase.update({
    where: { id: caseId },
    data: {
      status,
      resolvedAt: isTerminal ? new Date() : null,
      resolvedByProfileId: null, // admin action
      resolvedReversedAt: null,
    },
  });
  // Log it as a timeline entry so the history is preserved.
  await prisma.rescueCaseUpdate.create({
    data: {
      caseId,
      text: `Status changed → ${RESCUE_CASE_STATUS_LABEL[status] || status}`,
      category: 'admin',
    },
  });
  redirect(`/rescue/cases/${caseId}`);
}

// PR H: admin un-close. Calls into the shared reverseResolution() so
// behavior matches what volunteers see when they hit Undo from the portal.
async function adminUndoResolution(caseId: string, formData: FormData) {
  'use server';
  await requireOperator();
  const reason = String(formData.get('reason') || '').trim() || 'Admin reverted';
  await reverseResolution({
    jobType: 'RescueCase',
    jobId: caseId,
    actorProfileId: null, // admin: no window enforcement, no actor-points
    reason,
  });
  redirect(`/rescue/cases/${caseId}`);
}

async function markRescuedAndCreateBird(caseId: string) {
  'use server';
  await requireOperator();
  const c = await prisma.rescueCase.findUnique({ where: { id: caseId } });
  if (!c) return;
  if (c.rescuedBirdId) {
    // Already has a bird — just flip status if needed.
    if (c.status !== 'rescued') {
      await prisma.rescueCase.update({ where: { id: caseId }, data: { status: 'rescued' } });
    }
    redirect(`/rescue/cases/${caseId}`);
  }

  // Pre-populate Bird from case context.
  const birdName = c.birdDescription
    ? c.birdDescription.slice(0, 80)
    : `Rescued bird ${new Date().toLocaleDateString()}`;

  const bird = await prisma.bird.create({
    data: {
      name: birdName,
      foundLocation: c.location || c.address || null,
      finderName: c.reporterName,
      finderContact: c.reporterPhone || c.reporterContact,
      behaviorNotes: c.issue,
      status: 'needs_intake',
    },
  });

  await prisma.rescueCase.update({
    where: { id: caseId },
    data: { status: 'rescued', rescuedBirdId: bird.id },
  });
  await prisma.rescueCaseUpdate.create({
    data: {
      caseId,
      text: `Bird rescued + intake started → created Bird record "${bird.name}"`,
    },
  });
  redirect(`/birds/${bird.id}`);
}

async function deletePhoto(caseId: string, photoId: string) {
  'use server';
  await requireOperator();
  await prisma.rescueCasePhoto.delete({ where: { id: photoId } });
  redirect(`/rescue/cases/${caseId}`);
}

async function archiveCase(caseId: string) {
  'use server';
  await requireOperator();
  await prisma.rescueCase.update({ where: { id: caseId }, data: { archivedAt: new Date() } });
  redirect('/rescue/cases');
}

// ---------- Page ----------

export default async function RescueCaseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOperator();
  const { id } = await params;
  const [c, volunteers] = await Promise.all([
    prisma.rescueCase.findUnique({
      where: { id },
      include: {
        updates: { orderBy: { attemptedAt: 'desc' } },
        photos: { orderBy: { createdAt: 'asc' } },
        assignedVolunteer: true,
        rescuedBird: true,
      },
    }),
    prisma.rescueVolunteer.findMany({ orderBy: { name: 'asc' } }),
  ]);
  if (!c) notFound();

  const addUpdateAction = addUpdate.bind(null, id);
  const addPhotosAction = addPhotos.bind(null, id);
  const updateCaseAction = updateCase.bind(null, id);
  const archiveAction = archiveCase.bind(null, id);

  const headline = c.birdDescription || c.issue || 'Rescue case';

  return (
    <div className="space-y-4">
      <Link href="/rescue/cases" className="text-sm text-teal-700 hover:underline">← Rescue cases</Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <H1>{headline}</H1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Pill tone={RESCUE_CASE_STATUS_TONE[c.status] || 'gray'}>
              {RESCUE_CASE_STATUS_LABEL[c.status] || c.status}
            </Pill>
            {c.assignedVolunteer && (
              <span className="text-xs text-gray-600">
                Rescuer: <strong>{c.assignedVolunteer.name}</strong>
              </span>
            )}
            {c.rescuedBird && (
              <Link href={`/birds/${c.rescuedBird.id}`} className="text-xs text-emerald-700 hover:underline">
                → Bird record: <strong>{c.rescuedBird.name}</strong>
              </Link>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Called in {fmtDateTime(c.dateCalledIn)} · created {fmtRelative(c.createdAt)}
          </p>
        </div>
        <form action={archiveAction}>
          <Btn type="submit" variant="ghost">Archive</Btn>
        </form>
      </div>

      {/* Status workflow */}
      {c.status === 'needs_rescue' && (
        <Card tone="orange">
          <div className="flex items-center gap-2 flex-wrap">
            <H2>Status workflow</H2>
            <span className="text-sm text-gray-600">Change as the situation evolves:</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <form action={markRescuedAndCreateBird.bind(null, id)}>
              <Btn type="submit" variant="primary">✅ Mark rescued + create Bird record</Btn>
            </form>
            <form action={setStatus.bind(null, id, 'escaped_flew_away')}>
              <Btn type="submit" variant="ghost">💨 Escaped / flew away</Btn>
            </form>
            <form action={setStatus.bind(null, id, 'closed_unable')}>
              <Btn type="submit" variant="ghost">❌ Close — couldn&apos;t rescue</Btn>
            </form>
          </div>
        </Card>
      )}
      {c.status === 'escaped_flew_away' && (
        <Card tone="yellow">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-700">Bird escaped. If it&apos;s spotted again or you want to retry:</span>
            <form action={setStatus.bind(null, id, 'needs_rescue')}>
              <Btn type="submit" variant="primary">Reopen — needs rescue</Btn>
            </form>
            <form action={markRescuedAndCreateBird.bind(null, id)}>
              <Btn type="submit" variant="ghost">✅ Actually rescued — create Bird</Btn>
            </form>
          </div>
        </Card>
      )}
      {c.status === 'closed_unable' && (
        <Card>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-700">Case closed. To reopen:</span>
            <form action={adminUndoResolution.bind(null, id)} className="flex items-center gap-2 flex-wrap">
              <input name="reason" placeholder="Reason (optional)" className={`${inputClass} w-auto`} />
              <Btn type="submit" variant="ghost">Un-close + re-dispatch</Btn>
            </form>
          </div>
        </Card>
      )}

      {/* PR H: admins can always un-close ANY resolved case (rescued / escaped
          / closed_unable), which reverses points + re-opens the case + re-dispatches. */}
      {['rescued', 'escaped_flew_away'].includes(c.status) && (
        <Card>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-700">Closed by accident? Admin override:</span>
            <form action={adminUndoResolution.bind(null, id)} className="flex items-center gap-2 flex-wrap">
              <input name="reason" placeholder="Reason" className={`${inputClass} w-auto`} />
              <Btn type="submit" variant="ghost">Un-close + reverse points</Btn>
            </form>
          </div>
        </Card>
      )}

      {/* Photos */}
      {c.photos.length > 0 && (
        <Card>
          <H2>Photos ({c.photos.length})</H2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 mt-3">
            {c.photos.map((p) => (
              <div key={p.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption || ''} className="w-full h-32 object-cover rounded" />
                <form action={deletePhoto.bind(null, id, p.id)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition">
                  <button type="submit" className="rounded-full bg-red-600 text-white text-xs px-2 py-0.5">×</button>
                </form>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Add photos */}
      <Card>
        <H2>Add photos</H2>
        <form action={addPhotosAction} className="mt-3" encType="multipart/form-data">
          <input type="file" name="photos" multiple accept="image/*" className={inputClass} />
          <div className="mt-2">
            <Btn type="submit" variant="primary">Upload</Btn>
          </div>
        </form>
      </Card>

      {/* Add update (timeline) */}
      <Card tone="blue">
        <H2>+ Add update</H2>
        <form action={addUpdateAction} className="space-y-3 mt-3">
          <Field label="What happened?">
            <textarea
              required
              name="text"
              rows={3}
              className={inputClass}
              placeholder='e.g. "Drove out, bird flew to roof, returning at dusk"'
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Who logged this">
              <input name="authorName" className={inputClass} maxLength={120} placeholder="optional" />
            </Field>
            <Field label="When did the attempt/observation happen">
              <input type="datetime-local" name="attemptedAt" className={inputClass} />
            </Field>
          </div>
          <Btn type="submit" variant="primary">Log update</Btn>
        </form>
      </Card>

      {/* Timeline */}
      <Card>
        <H2>Timeline ({c.updates.length})</H2>
        {c.updates.length === 0 ? (
          <Empty msg="No updates logged yet. Add one above to start the timeline." />
        ) : (
          <ul className="divide-y divide-gray-100 mt-3">
            {c.updates.map((u) => (
              <li key={u.id} className="py-3">
                <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                  <span>{fmtDateTime(u.attemptedAt)}</span>
                  {u.authorName && <span>· <strong className="text-gray-700">{u.authorName}</strong></span>}
                  <span className="ml-auto">{fmtRelative(u.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap">{u.text}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Case details / edit */}
      <Card>
        <H2>Case details</H2>
        <form action={updateCaseAction} className="space-y-3 mt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Description">
              <input name="birdDescription" defaultValue={c.birdDescription ?? ''} className={inputClass} maxLength={200} />
            </Field>
            <Field label="Issue">
              <input name="issue" defaultValue={c.issue ?? ''} className={inputClass} maxLength={500} />
            </Field>
            <Field label="Location">
              <input name="location" defaultValue={c.location ?? ''} className={inputClass} maxLength={500} />
            </Field>
            <Field label="Address">
              <input name="address" defaultValue={c.address ?? ''} className={inputClass} maxLength={300} />
            </Field>
            <Field label="Reporter name">
              <input name="reporterName" defaultValue={c.reporterName ?? ''} className={inputClass} maxLength={200} />
            </Field>
            <Field label="Reporter phone">
              <input name="reporterPhone" defaultValue={c.reporterPhone ?? ''} className={inputClass} maxLength={50} />
            </Field>
            <Field label="Other reporter contact" className="sm:col-span-2">
              <input name="reporterContact" defaultValue={c.reporterContact ?? ''} className={inputClass} maxLength={500} />
            </Field>
            <Field label="Assigned rescuer">
              <select name="assignedVolunteerId" defaultValue={c.assignedVolunteerId ?? ''} className={inputClass}>
                <option value="">— unassigned —</option>
                {volunteers.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Last seen — when">
              <input
                type="datetime-local"
                name="lastSeenAt"
                defaultValue={c.lastSeenAt ? toLocalDatetime(c.lastSeenAt) : ''}
                className={inputClass}
              />
            </Field>
            <Field label="Last seen — location" className="sm:col-span-2">
              <input name="lastSeenLocation" defaultValue={c.lastSeenLocation ?? ''} className={inputClass} maxLength={500} />
            </Field>
            <Field label="Last seen — notes" className="sm:col-span-2">
              <textarea name="lastSeenNotes" defaultValue={c.lastSeenNotes ?? ''} rows={2} className={inputClass} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea name="notes" defaultValue={c.notes ?? ''} rows={3} className={inputClass} />
            </Field>
          </div>
          <Btn type="submit" variant="primary">Save details</Btn>
        </form>
      </Card>
    </div>
  );
}

function toLocalDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
