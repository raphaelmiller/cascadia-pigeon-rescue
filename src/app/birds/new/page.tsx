import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { H1, Card, Field, Btn, inputClass } from '@/components/ui';
import { BIRD_STATUSES, STATUS_LABELS, MEDICAL_PRIORITIES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

async function createBird(formData: FormData) {
  'use server';
  const name = String(formData.get('name') || '').trim() || 'Unnamed';
  const status = String(formData.get('status') || 'needs_intake');
  const medicalPriority = String(formData.get('medicalPriority') || 'none');
  const fosterId = String(formData.get('fosterId') || '') || null;

  const bird = await prisma.bird.create({
    data: {
      name,
      species: String(formData.get('species') || '') || null,
      breed: String(formData.get('breed') || '') || null,
      age: String(formData.get('age') || '') || null,
      sex: String(formData.get('sex') || '') || null,
      weightGrams: formData.get('weightGrams') ? Number(formData.get('weightGrams')) : null,
      bandInfo: String(formData.get('bandInfo') || '') || null,
      foundLocation: String(formData.get('foundLocation') || '') || null,
      finderName: String(formData.get('finderName') || '') || null,
      finderContact: String(formData.get('finderContact') || '') || null,
      status,
      medicalPriority,
      primaryDiagnosis: String(formData.get('primaryDiagnosis') || '') || null,
      contagionRisk: String(formData.get('contagionRisk') || '') || null,
      dietNotes: String(formData.get('dietNotes') || '') || null,
      behaviorNotes: String(formData.get('behaviorNotes') || '') || null,
      specialHandling: String(formData.get('specialHandling') || '') || null,
      medicalNotes: String(formData.get('medicalNotes') || '') || null,
      fosterId: fosterId || undefined,
    },
  });
  redirect(`/birds/${bird.id}`);
}

export default async function NewBirdPage() {
  const fosters = await prisma.foster.findMany({ orderBy: { name: 'asc' } });
  return (
    <div className="space-y-4">
      <H1>New bird intake</H1>
      <form action={createBird} className="space-y-4">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name *">
              <input required name="name" className={inputClass} placeholder="Ada / Drum / etc." />
            </Field>
            <Field label="Species">
              <input name="species" className={inputClass} placeholder="rock pigeon, feral, dove…" />
            </Field>
            <Field label="Breed/type">
              <input name="breed" className={inputClass} />
            </Field>
            <Field label="Age">
              <input name="age" className={inputClass} placeholder="hatchling / juvenile / adult / 3 mo" />
            </Field>
            <Field label="Sex">
              <select name="sex" className={inputClass} defaultValue="">
                <option value="">Unknown</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </Field>
            <Field label="Weight (g)">
              <input type="number" step="0.1" name="weightGrams" className={inputClass} />
            </Field>
            <Field label="Band info">
              <input name="bandInfo" className={inputClass} />
            </Field>
            <Field label="Status *">
              <select name="status" defaultValue="needs_intake" className={inputClass}>
                {BIRD_STATUSES.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold mb-3">Where found / who found</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Found location" className="sm:col-span-2">
              <input name="foundLocation" className={inputClass} />
            </Field>
            <Field label="Finder name">
              <input name="finderName" className={inputClass} />
            </Field>
            <Field label="Finder contact">
              <input name="finderContact" className={inputClass} placeholder="phone / email" />
            </Field>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold mb-3">Medical</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Medical priority">
              <select name="medicalPriority" defaultValue="none" className={inputClass}>
                {MEDICAL_PRIORITIES.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field label="Contagion risk">
              <select name="contagionRisk" defaultValue="" className={inputClass}>
                <option value="">unknown / none</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </Field>
            <Field label="Primary diagnosis" className="sm:col-span-2">
              <input name="primaryDiagnosis" className={inputClass} />
            </Field>
            <Field label="Medical notes" className="sm:col-span-2">
              <textarea name="medicalNotes" rows={3} className={inputClass} />
            </Field>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold mb-3">Notes & assignment</h3>
          <div className="grid gap-4">
            <Field label="Diet notes">
              <textarea name="dietNotes" rows={2} className={inputClass} />
            </Field>
            <Field label="Behavior notes">
              <textarea name="behaviorNotes" rows={2} className={inputClass} />
            </Field>
            <Field label="Special handling">
              <textarea name="specialHandling" rows={2} className={inputClass} />
            </Field>
            <Field label="Assign to foster">
              <select name="fosterId" defaultValue="" className={inputClass}>
                <option value="">— Unassigned —</option>
                {fosters.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <div className="flex gap-2">
          <Btn type="submit" variant="primary">Create bird</Btn>
          <Btn href="/birds" variant="ghost">Cancel</Btn>
        </div>
      </form>
    </div>
  );
}
