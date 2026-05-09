import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { H1, Card, Field, Btn, inputClass } from '@/components/ui';
import { REHAB_PROFICIENCY, REHAB_PROFICIENCY_LABEL, ALL_SKILL_KEYS } from '@/lib/constants';
import { SkillAssessment } from '@/components/SkillAssessment';

export const dynamic = 'force-dynamic';

async function createFoster(formData: FormData) {
  'use server';
  const skillData: Record<string, boolean> = {};
  for (const key of ALL_SKILL_KEYS) skillData[key] = formData.get(key) === 'on';

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
        {/* Contact */}
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

        {/* Capacity & profile */}
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

        {/* Transport — its own dedicated section */}
        <Card>
          <h3 className="font-semibold mb-2">Transport</h3>
          <p className="text-xs text-gray-500 mb-3">Tracked separately from the clinical assessment.</p>
          <label className="flex items-center gap-2 text-sm rounded-lg p-2 hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" name="canTransportSelf" className="h-4 w-4 rounded border-gray-300" />
            Can transport birds themselves
          </label>
        </Card>

        {/* Skill & care assessment */}
        <div>
          <h2 className="text-lg font-semibold mb-2">Foster Skill & Care Assessment</h2>
          <p className="text-xs text-gray-500 mb-3">
            Tick what this foster can do confidently. Scores update live.
          </p>
          <SkillAssessment />
        </div>

        {/* Notes */}
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
