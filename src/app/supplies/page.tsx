import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { H1, H2, Card, Pill, Btn, Empty, Field, inputClass, StatusDot } from '@/components/ui';
import { SUPPLY_CATEGORIES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

async function createSupply(formData: FormData) {
  'use server';
  const name = String(formData.get('name') || '').trim();
  if (!name) return;
  await prisma.supply.create({
    data: {
      name,
      category: String(formData.get('category') || '') || null,
      unit: String(formData.get('unit') || '') || null,
      onHand: Number(formData.get('onHand') || 0),
      threshold: Number(formData.get('threshold') || 0),
      reorderUrl: String(formData.get('reorderUrl') || '') || null,
      notes: String(formData.get('notes') || '') || null,
    },
  });
  redirect('/supplies');
}

async function adjustOnHand(id: string, delta: number) {
  'use server';
  const s = await prisma.supply.findUnique({ where: { id } });
  if (!s) return;
  const next = Math.max(0, s.onHand + delta);
  await prisma.supply.update({ where: { id }, data: { onHand: next } });
  redirect('/supplies');
}

async function setOnHand(id: string, formData: FormData) {
  'use server';
  const v = Number(formData.get('onHand') || 0);
  await prisma.supply.update({ where: { id }, data: { onHand: Math.max(0, v) } });
  redirect('/supplies');
}

export default async function SuppliesPage() {
  const supplies = await prisma.supply.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  const lowStock = supplies.filter(s => s.threshold > 0 && s.onHand <= s.threshold);
  const grouped = supplies.reduce<Record<string, typeof supplies>>((acc, s) => {
    const k = s.category || 'other';
    (acc[k] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <H1>Supplies</H1>
          <p className="text-sm text-gray-600 mt-1">{supplies.length} items · {lowStock.length} low</p>
        </div>
      </div>

      {lowStock.length > 0 && (
        <Card tone="red">
          <H2>Low stock — reorder soon</H2>
          <ul className="divide-y divide-gray-100 mt-3">
            {lowStock.map(s => (
              <li key={s.id} className="py-2 flex items-center gap-3">
                <StatusDot tone={s.onHand === 0 ? 'red' : 'orange'} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-gray-500">
                    {s.onHand} / threshold {s.threshold} {s.unit || ''} · {s.category || 'uncategorized'}
                  </div>
                </div>
                {s.reorderUrl && <a href={s.reorderUrl} target="_blank" rel="noreferrer" className="text-sm text-teal-700 underline">Reorder ↗</a>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <Card key={cat}>
          <H2>{cat}</H2>
          {items.length === 0 ? <Empty msg="None." /> : (
            <ul className="divide-y divide-gray-100 mt-3">
              {items.map(s => {
                const low = s.threshold > 0 && s.onHand <= s.threshold;
                return (
                  <li key={s.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                    <StatusDot tone={low ? (s.onHand === 0 ? 'red' : 'orange') : 'green'} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-gray-500">
                        on hand: <strong>{s.onHand}{s.unit ? ` ${s.unit}` : ''}</strong> · threshold {s.threshold}
                        {s.notes ? ` · ${s.notes}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-1 items-center">
                      <form action={async () => { 'use server'; await adjustOnHand(s.id, -1); }}><Btn type="submit" variant="ghost">−1</Btn></form>
                      <form action={async () => { 'use server'; await adjustOnHand(s.id, 1); }}><Btn type="submit" variant="ghost">+1</Btn></form>
                      <form action={setOnHand.bind(null, s.id)} className="flex items-center gap-1">
                        <input type="number" step="0.1" name="onHand" defaultValue={s.onHand} className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                        <Btn type="submit" variant="ghost">Set</Btn>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ))}

      <Card>
        <H2>Add supply</H2>
        <form action={createSupply} className="grid gap-3 sm:grid-cols-2 mt-3">
          <Field label="Name *"><input required name="name" className={inputClass} /></Field>
          <Field label="Category">
            <select name="category" defaultValue="" className={inputClass}>
              <option value="">— none —</option>
              {SUPPLY_CATEGORIES.map(c => (<option key={c} value={c}>{c}</option>))}
            </select>
          </Field>
          <Field label="Unit"><input name="unit" placeholder="lb, box, mL, each" className={inputClass} /></Field>
          <Field label="On hand"><input type="number" step="0.1" name="onHand" defaultValue={0} className={inputClass} /></Field>
          <Field label="Threshold (alert when ≤)"><input type="number" step="0.1" name="threshold" defaultValue={0} className={inputClass} /></Field>
          <Field label="Reorder URL"><input name="reorderUrl" placeholder="amazon.com/…" className={inputClass} /></Field>
          <Field label="Notes" className="sm:col-span-2"><textarea name="notes" rows={2} className={inputClass} /></Field>
          <div className="sm:col-span-2"><Btn type="submit" variant="primary">+ Add supply</Btn></div>
        </form>
      </Card>
    </div>
  );
}
