import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { H1, H2, Card, Pill, Btn, Empty } from '@/components/ui';
import { fmtDate, fmtRelative } from '@/lib/utils';
import { STATUS_LABELS, STATUS_TONE, stressLabel, stressTone } from '@/lib/constants';
import { StatusDot } from '@/components/ui';

export const dynamic = 'force-dynamic';

async function restoreBird(id: string) {
  'use server';
  await prisma.bird.update({ where: { id }, data: { archivedAt: null, deletedAt: null } });
  redirect('/archive');
}

async function permaDeleteBird(id: string) {
  'use server';
  await prisma.bird.delete({ where: { id } });
  redirect('/archive');
}

async function restoreFoster(id: string) {
  'use server';
  await prisma.foster.update({ where: { id }, data: { archivedAt: null, deletedAt: null } });
  redirect('/archive');
}

async function permaDeleteFoster(id: string) {
  'use server';
  await prisma.foster.delete({ where: { id } });
  redirect('/archive');
}

async function softDeleteAllArchivedBirds() {
  'use server';
  await prisma.bird.updateMany({
    where: { archivedAt: { not: null }, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  redirect('/archive');
}

export default async function ArchivePage() {
  const [archivedBirds, deletedBirds, archivedFosters, deletedFosters] = await Promise.all([
    prisma.bird.findMany({
      where: { archivedAt: { not: null }, deletedAt: null },
      orderBy: { archivedAt: 'desc' },
      include: { foster: true },
    }),
    prisma.bird.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
    }),
    prisma.foster.findMany({
      where: { archivedAt: { not: null }, deletedAt: null },
      orderBy: { archivedAt: 'desc' },
    }),
    prisma.foster.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
    }),
  ]);

  return (
    <div className="space-y-4">
      <H1>Archive & Trash</H1>
      <p className="text-sm text-gray-600">
        Archived records are hidden from operational views but kept indefinitely.
        Deleted records are in the trash and can be restored — or permanently destroyed.
      </p>

      {/* ARCHIVED BIRDS */}
      <Card tone="gray">
        <H2>📦 Archived birds ({archivedBirds.length})</H2>
        {archivedBirds.length === 0 ? <Empty msg="No archived birds." /> : (
          <ul className="divide-y divide-gray-100 mt-3">
            {archivedBirds.map(b => (
              <li key={b.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                <StatusDot tone={STATUS_TONE[b.status] || 'gray'} />
                <Link href={`/birds/${b.id}`} className="font-medium text-teal-700 hover:underline">{b.name}</Link>
                <Pill tone={STATUS_TONE[b.status] || 'gray'}>{STATUS_LABELS[b.status] || b.status}</Pill>
                <span className="text-xs text-gray-500 ml-auto">archived {fmtRelative(b.archivedAt)}</span>
                <form action={async () => { 'use server'; await restoreBird(b.id); }}>
                  <Btn type="submit" variant="primary">↺ Restore</Btn>
                </form>
                <form action={async () => { 'use server'; await prisma.bird.update({ where: { id: b.id }, data: { deletedAt: new Date() } }); }}>
                  <Btn type="submit" variant="danger">→ Trash</Btn>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* DELETED BIRDS (TRASH) */}
      <Card tone={deletedBirds.length ? 'red' : 'gray'}>
        <H2>🗑️ Deleted birds (trash) — {deletedBirds.length}</H2>
        {deletedBirds.length === 0 ? <Empty msg="Trash is empty." /> : (
          <ul className="divide-y divide-gray-100 mt-3">
            {deletedBirds.map(b => (
              <li key={b.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                <StatusDot tone="red" />
                <span className="font-medium line-through">{b.name}</span>
                <Pill tone={STATUS_TONE[b.status] || 'gray'}>{STATUS_LABELS[b.status] || b.status}</Pill>
                <span className="text-xs text-gray-500 ml-auto">deleted {fmtRelative(b.deletedAt)}</span>
                <form action={async () => { 'use server'; await restoreBird(b.id); }}>
                  <Btn type="submit" variant="primary">↺ Restore</Btn>
                </form>
                <form action={async () => { 'use server'; await permaDeleteBird(b.id); }}>
                  <Btn type="submit" variant="danger">⚠ Permanently delete</Btn>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ARCHIVED FOSTERS */}
      <Card tone="gray">
        <H2>📦 Archived fosters ({archivedFosters.length})</H2>
        {archivedFosters.length === 0 ? <Empty msg="No archived fosters." /> : (
          <ul className="divide-y divide-gray-100 mt-3">
            {archivedFosters.map(f => (
              <li key={f.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                <StatusDot tone={stressTone(f.currentStress)} />
                <Link href={`/fosters/${f.id}`} className="font-medium text-teal-700 hover:underline">{f.name}</Link>
                <span className="text-xs text-gray-500">{stressLabel(f.currentStress)}</span>
                <span className="text-xs text-gray-500 ml-auto">archived {fmtRelative(f.archivedAt)}</span>
                <form action={async () => { 'use server'; await restoreFoster(f.id); }}>
                  <Btn type="submit" variant="primary">↺ Restore</Btn>
                </form>
                <form action={async () => { 'use server'; await prisma.foster.update({ where: { id: f.id }, data: { deletedAt: new Date() } }); }}>
                  <Btn type="submit" variant="danger">→ Trash</Btn>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* DELETED FOSTERS */}
      <Card tone={deletedFosters.length ? 'red' : 'gray'}>
        <H2>🗑️ Deleted fosters (trash) — {deletedFosters.length}</H2>
        {deletedFosters.length === 0 ? <Empty msg="Trash is empty." /> : (
          <ul className="divide-y divide-gray-100 mt-3">
            {deletedFosters.map(f => (
              <li key={f.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                <StatusDot tone="red" />
                <span className="font-medium line-through">{f.name}</span>
                <span className="text-xs text-gray-500 ml-auto">deleted {fmtRelative(f.deletedAt)}</span>
                <form action={async () => { 'use server'; await restoreFoster(f.id); }}>
                  <Btn type="submit" variant="primary">↺ Restore</Btn>
                </form>
                <form action={async () => { 'use server'; await permaDeleteFoster(f.id); }}>
                  <Btn type="submit" variant="danger">⚠ Permanently delete</Btn>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-gray-500">
        💡 <strong>Archive</strong> hides records from active views but keeps their full history (use for resolved cases like adopted/released/closed birds, or fosters who are inactive but might come back).
        <br />
        🗑️ <strong>Delete</strong> moves to trash — recoverable here. Permanent delete removes the record and all its history irreversibly.
      </p>
    </div>
  );
}
