import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { H1, Card, Field, Btn, inputClass } from '@/components/ui';
import { REHAB_PROFICIENCY, REHAB_PROFICIENCY_LABEL, ALL_SKILL_KEYS } from '@/lib/constants';
import { SkillAssessment } from '@/components/SkillAssessment';
import { saveUpload } from '@/lib/uploads';
import { requireOperator } from '@/lib/auth';
import { PartialDatePicker } from '@/components/PartialDatePicker';
import { readPartialDate } from '@/lib/partialDate';

export const dynamic = 'force-dynamic';

async function createFoster(formData: FormData) {
  'use server';
  await requireOperator();
  const skillData: Record<string, boolean> = {};
  for (const key of ALL_SKILL_KEYS) skillData[key] = formData.get(key) === 'on';

  // Profile photo upload (optional)
  let photoUrl: string | null = null;
  const photoFile = formData.get('photo');
  if (photoFile instanceof File && photoFile.size > 0) {
    const saved = await saveUpload(photoFile, 'fosters', { allow: 'image' });
    if (saved) photoUrl = saved.url;
  }

  const joined = readPartialDate(formData, 'joinedDate');

  const f = await prisma.foster.create({
    data: {
      photoUrl,
      name: String(formData.get('name') || '').trim() || 'Foster',
      phone: String(formData.get('phone') || '') || null,
      email: String(formData.get('email') || '') || null,
      address: String(formData.get('address') || '') || null,
      capacity: Number(formData.get('capacity') || 0),
      medicalSkill: String(formData.get('medicalSkill') || 'beginner'),
      longTermAble: formData.get('longTermAble') === 'on',
      canTransportSelf: formData.get('canTransportSelf') === 'on',
      notes: String(formData.get('notes') || '') || null,
      joinedDateYear: joined.year,
      joinedDateMonth: joined.month,
      joinedDateDay: joined.day,
      ...skillData,
    },
  });
  redirect(`/fosters/${f.id}`);
}

export default function NewFosterPage() {
  return (
    <div className="space-y-4">
      <H1>New foster</H1>
      <form action={createFoster} className="space-y-4" encType="multipart/form-data">
        {/* Profile photo */}
        <Card>
          <h3 className="font-semibold mb-3">Profile photo</h3>
          <p className="text-xs text-gray-500 mb-3">Optional. JPEG / PNG / WEBP / HEIC, up to 25MB.</p>
          <input
            type="file"
            name="photo"
            accept="image/*"
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:text-teal-800 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-teal-100"
          />
        </Card>

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
            <Field label="Date joined" className="sm:col-span-2">
              <PartialDatePicker name="joinedDate" />
              <p className="text-xs text-gray-500 mt-1">
                Year is enough. Add month and day only if you know them.
              </p>
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
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="longTermAble" className="h-4 w-4 rounded border-gray-300" />
              Available for long-term foster
            </label>
          </div>
        </Card>

        {/* Transport — its own dedicated section */}
        <Card>
          <h3 className="font-semibold mb-3">Transport</h3>
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
