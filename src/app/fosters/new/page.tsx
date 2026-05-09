import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { H1, Card, Field, Btn, inputClass } from '@/components/ui';
import { REHAB_PROFICIENCY, REHAB_PROFICIENCY_LABEL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

async function createFoster(formData: FormData) {
  'use server';
  const f = await prisma.foster.create({
    data: {
      name: String(formData.get('name') || '').trim() || 'Foster',
      phone: String(formData.get('phone') || '') || null,
      email: String(formData.get('email') || '') || null,
      address: String(formData.get('address') || '') || null,
      hasTransport: formData.get('hasTransport') === 'on',
      capacity: Number(formData.get('capacity') || 0),
      quarantineAble: formData.get('quarantineAble') === 'on',
      medicalSkill: String(formData.get('medicalSkill') || 'beginner'),
      tubeFeedingSkill: formData.get('tubeFeedingSkill') === 'on',
      woundCareSkill: formData.get('woundCareSkill') === 'on',
      neonateSkill: formData.get('neonateSkill') === 'on',
      longTermAble: formData.get('longTermAble') === 'on',
      preferredTypes: String(formData.get('preferredTypes') || '') || null,
      availability: String(formData.get('availability') || '') || null,
      notes: String(formData.get('notes') || '') || null,
    },
  });
  redirect(`/fosters/${f.id}`);
}

export default function NewFosterPage() {
  return (
    <div className="space-y-4">
      <H1>New foster</H1>
      <form action={createFoster} className="space-y-4">
        <Card>
          <h3 className="font-semibold mb-3">Contact</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *">
              <input required name="name" className={inputClass} />
            </Field>
            <Field label="Phone">
              <input name="phone" className={inputClass} />
            </Field>
            <Field label="Email">
              <input type="email" name="email" className={inputClass} />
            </Field>
            <Field label="Address / location">
              <input name="address" className={inputClass} />
            </Field>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold mb-3">Capabilities</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Capacity (max birds)">
              <input type="number" name="capacity" defaultValue={2} className={inputClass} />
            </Field>
            <Field label="Rehab proficiency">
              <select name="medicalSkill" defaultValue="beginner" className={inputClass}>
                {REHAB_PROFICIENCY.map(s => (
                  <option key={s} value={s}>{REHAB_PROFICIENCY_LABEL[s]}</option>
                ))}
              </select>
            </Field>
            <Field label="Preferred bird types">
              <input name="preferredTypes" placeholder="ferals, neonates, juveniles…" className={inputClass} />
            </Field>
            <Field label="Availability">
              <input name="availability" placeholder="available / limited / on hold" className={inputClass} />
            </Field>
            <div className="sm:col-span-2 grid gap-2 grid-cols-2">
              <CheckRow name="hasTransport" label="Has own transport" />
              <CheckRow name="quarantineAble" label="Has quarantine setup" />
              <CheckRow name="tubeFeedingSkill" label="Tube feeding skill" />
              <CheckRow name="woundCareSkill" label="Wound care" />
              <CheckRow name="neonateSkill" label="Neonates" />
              <CheckRow name="longTermAble" label="Long-term foster" />
            </div>
          </div>
        </Card>

        <Card>
          <Field label="Notes">
            <textarea name="notes" rows={3} className={inputClass} />
          </Field>
        </Card>

        <div className="flex gap-2">
          <Btn type="submit" variant="primary">Create foster</Btn>
          <Btn href="/fosters" variant="ghost">Cancel</Btn>
        </div>
      </form>
    </div>
  );
}

function CheckRow({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} className="h-4 w-4 rounded border-gray-300" />
      {label}
    </label>
  );
}
