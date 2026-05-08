import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { H1, H2, Card, Btn, Empty, Field, inputClass, Pill } from '@/components/ui';
import { fmtDateTime, fmtRelative } from '@/lib/utils';
import { stressTone } from '@/lib/constants';

export const dynamic = 'force-dynamic';

async function createUpdate(formData: FormData) {
  'use server';
  const birdId = String(formData.get('birdId') || '');
  const fosterId = String(formData.get('fosterId') || '');
  if (!birdId || !fosterId) return;
  const stress = formData.get('stressLevel') ? Number(formData.get('stressLevel')) : null;

  await prisma.dailyUpdate.create({
    data: {
      birdId,
      fosterId,
      healthStatus: String(formData.get('healthStatus') || '') || null,
      eatingDrinking: String(formData.get('eatingDrinking') || '') || null,
      poopQuality: String(formData.get('poopQuality') || '') || null,
      energyLevel: String(formData.get('energyLevel') || '') || null,
      medsAdministered: String(formData.get('medsAdministered') || '') || null,
      stressLevel: stress,
      concerns: String(formData.get('concerns') || '') || null,
      whiteboardUpdate: String(formData.get('whiteboardUpdate') || '') || null,
      notes: String(formData.get('notes') || '') || null,
    },
  });

  // Cascade: stress level updates foster's currentStress + log a wellness entry
  if (stress != null) {
    await prisma.$transaction([
      prisma.foster.update({ where: { id: fosterId }, data: { currentStress: stress } }),
      prisma.wellnessLog.create({ data: { fosterId, stressLevel: stress, notes: 'auto from daily update' } }),
    ]);
  }
  // If whiteboardUpdate provided, replace
  const wb = String(formData.get('whiteboardUpdate') || '').trim();
  if (wb) {
    await prisma.foster.update({ where: { id: fosterId }, data: { whiteboardNote: wb } });
  }

  redirect('/updates');
}

export default async function UpdatesPage() {
  const [updates, birds, fosters] = await Promise.all([
    prisma.dailyUpdate.findMany({
      include: { bird: true, foster: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.bird.findMany({ orderBy: { name: 'asc' } }),
    prisma.foster.findMany({ orderBy: { name: 'asc' } }),
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
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
