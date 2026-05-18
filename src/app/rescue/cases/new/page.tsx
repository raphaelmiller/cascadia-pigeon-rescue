// PR D: New rescue case form.
//
// Christina is logging a bird-in-the-field report. She might have a
// photo from the caller, or might not. She might have a phone number,
// or not. Almost every field is optional — the goal is "capture what
// you have now, fill in the rest as it comes in."
//
// Server action persists the RescueCase + (optionally) any initial
// photos uploaded with it, using the existing saveUploads pipeline
// (R2 in prod / local disk in dev, folder "rescue-cases").

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, Card, Btn, Field, inputClass } from '@/components/ui';
import { requireOperator } from '@/lib/auth';
import { saveUploads } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

async function createCase(formData: FormData) {
  'use server';
  await requireOperator();

  const birdDescription = String(formData.get('birdDescription') || '').trim() || null;
  const issue = String(formData.get('issue') || '').trim() || null;
  const location = String(formData.get('location') || '').trim() || null;
  const address = String(formData.get('address') || '').trim() || null;
  const reporterName = String(formData.get('reporterName') || '').trim() || null;
  const reporterPhone = String(formData.get('reporterPhone') || '').trim() || null;
  const reporterContact = String(formData.get('reporterContact') || '').trim() || null;
  const notes = String(formData.get('notes') || '').trim() || null;
  const assignedVolunteerId = String(formData.get('assignedVolunteerId') || '') || null;
  const dateCalledInRaw = String(formData.get('dateCalledIn') || '').trim();

  // Reject totally empty submissions — at least one descriptor must be set.
  if (!birdDescription && !issue && !location && !reporterName && !reporterPhone) {
    return;
  }

  const created = await prisma.rescueCase.create({
    data: {
      birdDescription,
      issue,
      location,
      address,
      reporterName,
      reporterPhone,
      reporterContact,
      notes,
      assignedVolunteerId,
      ...(dateCalledInRaw ? { dateCalledIn: new Date(dateCalledInRaw) } : {}),
      // status defaults to 'needs_rescue'
    },
  });

  // Photos uploaded with the initial report. Saved outside the create
  // call because file IO can fail without rolling back the case — better
  // to have a case with no photos than no case at all.
  const photoFiles = formData.getAll('photos');
  if (photoFiles.length > 0) {
    const saved = await saveUploads(photoFiles, 'rescue-cases', { allow: 'image' });
    if (saved.length > 0) {
      await prisma.rescueCasePhoto.createMany({
        data: saved.map((s) => ({ caseId: created.id, url: s.url, caption: null })),
      });
    }
  }

  redirect(`/rescue/cases/${created.id}`);
}

export default async function NewRescueCasePage() {
  await requireOperator();
  const volunteers = await prisma.rescueVolunteer.findMany({ orderBy: { name: 'asc' } });

  return (
    <div className="space-y-4">
      <Link href="/rescue/cases" className="text-sm text-teal-700 hover:underline">← Rescue cases</Link>
      <H1>Report a rescue case</H1>
      <Card>
        <p className="text-sm text-gray-600 mb-4">
          Someone reported a bird in trouble. Fill in what you know — most fields are optional and can be added later as updates come in.
        </p>
        <form action={createCase} className="space-y-4" encType="multipart/form-data">
          {/* What */}
          <section className="rounded-lg border border-gray-200 p-3 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">The bird</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Description">
                <input
                  name="birdDescription"
                  placeholder='e.g. "blue bar pigeon"'
                  className={inputClass}
                  maxLength={200}
                />
              </Field>
              <Field label="Issue">
                <input
                  name="issue"
                  placeholder={'e.g. "broken wing, cannot fly"'}
                  className={inputClass}
                  maxLength={500}
                />
              </Field>
            </div>
            <Field label="Photos (optional, multiple)">
              <input
                type="file"
                name="photos"
                multiple
                accept="image/*"
                className={inputClass}
              />
            </Field>
          </section>

          {/* Where */}
          <section className="rounded-lg border border-gray-200 p-3 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Where</h3>
            <Field label="Location (how to find the bird)">
              <input
                name="location"
                placeholder='e.g. "parking garage on 7th and Spring"'
                className={inputClass}
                maxLength={500}
              />
            </Field>
            <Field label="Address (if known)">
              <input
                name="address"
                placeholder="Street address"
                className={inputClass}
                maxLength={300}
              />
            </Field>
          </section>

          {/* Reporter */}
          <section className="rounded-lg border border-gray-200 p-3 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Who reported it</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <input name="reporterName" className={inputClass} maxLength={200} />
              </Field>
              <Field label="Phone">
                <input name="reporterPhone" type="tel" className={inputClass} maxLength={50} />
              </Field>
            </div>
            <Field label="Other contact info">
              <input
                name="reporterContact"
                placeholder="Email, IG handle, alt phone, etc."
                className={inputClass}
                maxLength={500}
              />
            </Field>
            <Field label="Date called in">
              <input
                type="datetime-local"
                name="dateCalledIn"
                className={inputClass}
                defaultValue={toLocalDatetime(new Date())}
              />
            </Field>
          </section>

          {/* Assignment + notes */}
          <section className="rounded-lg border border-gray-200 p-3 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Plan</h3>
            <Field label="Assign rescuer (optional)">
              <select name="assignedVolunteerId" defaultValue="" className={inputClass}>
                <option value="">— leave unassigned —</option>
                {volunteers.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <textarea
                name="notes"
                rows={3}
                className={inputClass}
                placeholder="Any other context — vehicles on site, time-of-day patterns, etc."
              />
            </Field>
          </section>

          <div className="flex gap-2">
            <Btn type="submit" variant="primary">Save case</Btn>
            <Btn href="/rescue/cases" variant="ghost">Cancel</Btn>
          </div>
        </form>
      </Card>
    </div>
  );
}

function toLocalDatetime(d: Date): string {
  // datetime-local wants "YYYY-MM-DDTHH:mm" in *local* time.
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
