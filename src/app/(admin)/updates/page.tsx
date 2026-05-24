import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { H1, H2, Card, Btn, Empty, Field, inputClass, Pill } from '@/components/ui';
import { fmtDateTime, fmtRelative } from '@/lib/utils';
import { stressTone } from '@/lib/constants';
import { activeBirdWhere, activeFosterWhere } from '@/lib/filters';
import { saveUploads } from '@/lib/uploads';
import { parseForm, dailyUpdateSchema } from '@/lib/schemas';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function createUpdate(formData: FormData) {
  'use server';
  await requireOperator();
  const validated = parseForm(dailyUpdateSchema, formData);
  const { birdId, fosterId, stressLevel, whiteboardUpdate, ...rest } = validated;
  const wb = whiteboardUpdate ? whiteboardUpdate.trim() : null;

  // One transaction: create the daily update, optionally update foster
  // stress + whiteboard, log wellness. Either everything lands or nothing
  // does — prevents the read-update-vs-write race the old code had.
  const created = await prisma.$transaction(async tx => {
    const update = await tx.dailyUpdate.create({
      data: {
        birdId,
        fosterId,
        ...rest,
        stressLevel,
        whiteboardUpdate: wb,
      },
    });
    if (stressLevel != null) {
      await tx.foster.update({
        where: { id: fosterId },
        data: { currentStress: stressLevel },
      });
      await tx.wellnessLog.create({
        data: { fosterId, stressLevel, notes: 'auto from daily update' },
      });
    }
    if (wb) {
      await tx.foster.update({ where: { id: fosterId }, data: { whiteboardNote: wb } });
    }
    return update;
  });

  // Photos attached to the update (optional, multiple). Done outside the
  // transaction because file IO can fail without rolling back the metadata
  // — better to have an update with no photos than a phantom transaction.
  const photoFiles = formData.getAll('photos');
  const saved = await saveUploads(photoFiles, 'updates', { allow: 'image' });
  if (saved.length > 0) {
    await prisma.$transaction(
      saved.map(s => prisma.dailyUpdatePhoto.create({
        data: {
          dailyUpdateId: created.id,
          url: s.url,
          originalName: s.originalName,
          mimeType: s.mimeType,
        },
      })),
    );
  }

  redirect('/updates');
}

export default async function UpdatesPage() {
  const [updates, birds, fosters] = await Promise.all([
    prisma.dailyUpdate.findMany({
      where: { bird: activeBirdWhere, foster: activeFosterWhere },
      include: { bird: true, foster: true, photos: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.bird.findMany({ where: activeBirdWhere, orderBy: { name: 'asc' } }),
    prisma.foster.findMany({ where: activeFosterWhere, orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="space-y-4">
      <H1>Daily foster updates</H1>

      <Card tone="green">
        <H2>Submit an update</H2>
        <form action={createUpdate} className="grid gap-3 sm:grid-cols-2 mt-3">
          <Field label="Bird *">
            <select required name="birdId" defaultValue="" className={inputClass}>
              <option value="">— select —</option>
              {birds.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </Field>
          <Field label="Foster *">
            <select required name="fosterId" defaultValue="" className={inputClass}>
              <option value="">— select —</option>
              {fosters.map(f => (<option key={f.id} value={f.id}>{f.name}</option>))}
            </select>
          </Field>
          <Field label="Health status" className="sm:col-span-2">
            <input name="healthStatus" placeholder="bright / quiet / improving / declining" className={inputClass} />
          </Field>
          <Field label="Eating / drinking">
            <input name="eatingDrinking" placeholder="self-feeding / hand-fed / refusing" className={inputClass} />
          </Field>
          <Field label="Poop quality">
            <input name="poopQuality" placeholder="normal / loose / watery / green / etc." className={inputClass} />
          </Field>
          <Field label="Energy level">
            <input name="energyLevel" placeholder="alert / lethargic / fluffed" className={inputClass} />
          </Field>
          <Field label="Meds administered">
            <input name="medsAdministered" placeholder="enrofloxacin AM ✓" className={inputClass} />
          </Field>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">
              Foster stress (1–10)
            </label>
            <input type="range" name="stressLevel" min={1} max={10} defaultValue={5} className="w-full" />
          </div>
          <Field label="Concerns" className="sm:col-span-2">
            <textarea name="concerns" rows={2} className={inputClass} />
          </Field>
          <Field label="Whiteboard update (replaces foster's pinned note)" className="sm:col-span-2">
            <input name="whiteboardUpdate" placeholder="leave blank to keep current note" className={inputClass} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea name="notes" rows={2} className={inputClass} />
          </Field>
          <Field label="Photos (optional)" className="sm:col-span-2">
            <input
              type="file"
              name="photos"
              accept="image/*"
              multiple
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:text-teal-800 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-teal-100"
            />
          </Field>
          <div className="sm:col-span-2"><Btn type="submit" variant="primary">Submit update</Btn></div>
        </form>
      </Card>

      <Card>
        <H2>Recent updates</H2>
        {updates.length === 0 ? <Empty msg="No updates yet." /> : (
          <ul className="divide-y divide-gray-100 mt-3">
            {updates.map(u => (
              <li key={u.id} className="py-3">
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                  <span>{fmtDateTime(u.createdAt)}</span>
                  <span>·</span>
                  <Link href={`/birds/${u.birdId}`} className="text-teal-700 hover:underline">🕊 {u.bird.name}</Link>
                  <span>·</span>
                  <Link href={`/fosters/${u.fosterId}`} className="text-teal-700 hover:underline">{u.foster.name}</Link>
                  {u.stressLevel != null && <Pill tone={stressTone(u.stressLevel)}>stress {u.stressLevel}</Pill>}
                </div>
                <div className="text-sm mt-1"><strong>Health:</strong> {u.healthStatus || '—'}</div>
                <div className="text-xs text-gray-600 mt-0.5">
                  eat/drink {u.eatingDrinking || '—'} · poop {u.poopQuality || '—'} · energy {u.energyLevel || '—'} · meds {u.medsAdministered || '—'}
                </div>
                {u.concerns && <div className="text-sm mt-1 text-orange-700">⚠ {u.concerns}</div>}
                {u.notes && <div className="text-sm text-gray-600 mt-0.5">{u.notes}</div>}
                {u.photos && u.photos.length > 0 && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {u.photos.map(p => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer">
                        <img src={p.url} alt="daily update photo" className="h-20 w-20 rounded-lg object-cover ring-1 ring-gray-200 hover:ring-teal-400 transition" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
