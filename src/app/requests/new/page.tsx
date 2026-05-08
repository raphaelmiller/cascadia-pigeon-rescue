import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { H1, Card, Field, Btn, inputClass } from '@/components/ui';
import { REQUEST_TYPES, REQUEST_URGENCIES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

async function createRequest(formData: FormData) {
  'use server';
  const fosterId = String(formData.get('fosterId') || '');
  if (!fosterId) return;
  await prisma.request.create({
    data: {
      fosterId,
      birdId: String(formData.get('birdId') || '') || null,
      type: String(formData.get('type') || 'other'),
      urgency: String(formData.get('urgency') || 'normal'),
      description: String(formData.get('description') || '').trim(),
    },
  });
  redirect('/requests');
}

export default async function NewRequestPage() {
  const fosters = await prisma.foster.findMany({ orderBy: { name: 'asc' } });
  const birds = await prisma.bird.findMany({ orderBy: { name: 'asc' } });
  return (
    <div className="space-y-4">
      <H1>New request</H1>
      <form action={createRequest} className="space-y-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Foster *">
              <select required name="fosterId" defaultValue="" className={inputClass}>
                <option value="">— select —</option>
                {fosters.map(f => (<option key={f.id} value={f.id}>{f.name}</option>))}
              </select>
            </Field>
            <Field label="Bird (optional)">
              <select name="birdId" defaultValue="" className={inputClass}>
                <option value="">— none —</option>
                {birds.map(b => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </Field>
            <Field label="Type">
              <select name="type" defaultValue="supply" className={inputClass}>
                {REQUEST_TYPES.map(t => (<option key={t} value={t}>{t}</option>))}
              </select>
            </Field>
            <Field label="Urgency">
              <select name="urgency" defaultValue="normal" className={inputClass}>
                {REQUEST_URGENCIES.map(u => (<option key={u} value={u}>{u}</option>))}
              </select>
            </Field>
            <Field label="Description *" className="sm:col-span-2">
              <textarea required name="description" rows={4} className={inputClass} placeholder="What's needed?" />
            </Field>
          </div>
        </Card>
        <div className="flex gap-2">
          <Btn type="submit" variant="primary">Create request</Btn>
          <Btn href="/requests" variant="ghost">Cancel</Btn>
        </div>
      </form>
    </div>
  );
}
