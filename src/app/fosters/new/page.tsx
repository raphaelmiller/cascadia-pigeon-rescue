import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { H1, Card, Field, Btn, inputClass } from '@/components/ui';
import { REHAB_PROFICIENCY, REHAB_PROFICIENCY_LABEL, REHAB_SKILLS, REHAB_SKILLS_TOTAL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

async function createFoster(formData: FormData) {
  'use server';
  const skillData: Record<string, boolean> = {};
  for (const s of REHAB_SKILLS) skillData[s.key] = formData.get(s.key) === 'on';

  const f = await prisma.foster.create({
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
          <h3 className="font-semibold mb-3">Capacity & profile</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Capacity (max birds)">
              <input type="number" name="capacity" defaultValue={2} className={inputClass} />
            </Field>
            <Field label="Rehab proficiency">
              <select name="medicalSkill" defaultValue="beginner" className={inputClass}>
                {REHAB_PROFICIENCY.map(s => (<option key={s} value={s}>{REHAB_PROFICIENCY_LABEL[s]}</option>))}
              </select>
            </Field>
            <Field label="Preferred bird types" className="sm:col-span-2">
              <input name="preferredTypes" placeholder="ferals, neonates, juveniles…" className={inputClass} />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="longTermAble" className="h-4 w-4 rounded border-gray-300" />
              Available for long-term foster
            </label>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Rehab skills checklist</h3>
            <span className="text-xs text-gray-500">Score x / {REHAB_SKILLS_TOTAL}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {REHAB_SKILLS.map(s => (
              <label key={s.key} className="flex items-start gap-2 text-sm rounded-lg p-2 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" name={s.key} className="h-4 w-4 mt-0.5 rounded border-gray-300" />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold mb-3">Transport</h3>
          <label className="flex items-center gap-2 text-sm rounded-lg p-2 hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" name="canTransportSelf" className="h-4 w-4 rounded border-gray-300" />
            Can transport birds themselves
          </label>
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
