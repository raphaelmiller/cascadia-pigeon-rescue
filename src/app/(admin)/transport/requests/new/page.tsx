// PR C: New multi-stop transport request page.
//
// Replaces the inline single-stop form that lived on /transport. Christina's
// use case: a vet day might have 7 birds picked up from 4 houses and dropped
// off at 4 different houses. This page lets her build that whole request in
// one shot, with the option to leave any location/time blank until figured
// out.
//
// UX:
//   - Title + Type are top-of-form (same as legacy fields).
//   - Pickups section: repeating rows. Each row = location + time-start +
//     optional time-end (window) + per-stop notes. "+ Add a pickup" appends.
//     "×" removes. Empty = "no pickups yet".
//   - Drop-offs section: identical shape, separate add button.
//   - Birds section: multi-select chips searched against active Bird table.
//   - Notes: free-text, same as legacy.
//   - Urgency + optional driver assignment + initial notes.
//
// Server action:
//   - Wraps everything in a single prisma transaction.
//   - Creates TransportRequest, then TransportStop[] (sortOrder = index in
//     the form's array order), then TransportRequestBird[] (one row per
//     selected bird). TransportStopBird is left empty for MVP — per-stop
//     bird assignment is a Phase-2 UI add.
//   - Legacy fromAddress/toAddress/pickupBy/birdId stay null on new rows.
//
// All schema changes are additive — see prisma/migrations/
// 20260518225203_pr_c_transport_multistop_v2/migration.sql

import { redirect } from 'next/navigation';
import { dispatchJob } from '@/lib/volunteer/dispatch';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { H1, Card, Btn } from '@/components/ui';
import { activeBirdWhere } from '@/lib/filters';
import { requireOperator } from '@/lib/auth';
import { REQUEST_URGENCIES } from '@/lib/constants';
import { NewTransportForm } from './form';

export const dynamic = 'force-dynamic';

const TRANSPORT_TYPES = ['vet', 'intake', 'transfer', 'surrender', 'release', 'other'] as const;

async function createMultiStopRequest(formData: FormData) {
  'use server';
  await requireOperator();

  const title = String(formData.get('title') || '').trim() || null;
  const type = String(formData.get('type') || '').trim() || null;
  const urgency = String(formData.get('urgency') || 'normal');
  const description = String(formData.get('description') || '').trim() || null;
  const notes = String(formData.get('notes') || '').trim() || null;
  const volunteerId = String(formData.get('volunteerId') || '') || null;

  // Stops: serialized as JSON in a hidden input. Each is
  // { kind: 'pickup' | 'dropoff', location: string|null,
  //   timeStart: ISO|null, timeEnd: ISO|null, notes: string|null }.
  const stopsRaw = String(formData.get('stops') || '[]');
  let stopsParsed: Array<{
    kind: 'pickup' | 'dropoff';
    location: string | null;
    timeStart: string | null;
    timeEnd: string | null;
    notes: string | null;
  }> = [];
  try {
    const parsed = JSON.parse(stopsRaw);
    if (Array.isArray(parsed)) {
      stopsParsed = parsed
        .filter((s) => s && (s.kind === 'pickup' || s.kind === 'dropoff'))
        .map((s) => ({
          kind: s.kind,
          location: s.location ? String(s.location).trim() || null : null,
          timeStart: s.timeStart ? String(s.timeStart) : null,
          timeEnd: s.timeEnd ? String(s.timeEnd) : null,
          notes: s.notes ? String(s.notes).trim() || null : null,
        }));
    }
  } catch {
    // Treat malformed stops as empty rather than crashing — the request
    // shell is still useful.
  }

  // Birds: comma-separated list of cuids from the multi-select.
  const birdsRaw = String(formData.get('birdIds') || '');
  const birdIds = birdsRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Reject a totally empty request (no title, no stops, no birds) — that's
  // almost certainly a form misfire. Otherwise allow anything.
  if (!title && stopsParsed.length === 0 && birdIds.length === 0) return;

  // Phase 1 dispatch fields.
  const emergencyFlag = formData.get('emergencyFlag') === '1';
  const deadlineRaw = String(formData.get('deadline') || '').trim();

  // Single transaction so a partial failure can't leave orphan stops.
  const status = volunteerId ? 'assigned' : 'open';
  const created = await prisma.$transaction(async (tx) => {
    const req = await tx.transportRequest.create({
      data: {
        title,
        type,
        urgency,
        status,
        description,
        notes,
        volunteerId,
        emergencyFlag,
        ...(deadlineRaw ? { deadline: new Date(deadlineRaw) } : {}),
      },
    });

    if (stopsParsed.length > 0) {
      await tx.transportStop.createMany({
        data: stopsParsed.map((s, idx) => ({
          requestId: req.id,
          kind: s.kind,
          location: s.location,
          timeStart: s.timeStart ? new Date(s.timeStart) : null,
          timeEnd: s.timeEnd ? new Date(s.timeEnd) : null,
          notes: s.notes,
          sortOrder: idx,
        })),
      });
    }

    if (birdIds.length > 0) {
      // Dedupe + ignore bird ids that don't exist (form sends only known
      // active birds, but defense-in-depth).
      const existing = await tx.bird.findMany({
        where: { id: { in: birdIds }, ...activeBirdWhere },
        select: { id: true },
      });
      const validIds = Array.from(new Set(existing.map((b) => b.id)));
      if (validIds.length > 0) {
        await tx.transportRequestBird.createMany({
          data: validIds.map((birdId) => ({ requestId: req.id, birdId })),
        });
      }
    }

    return req;
  });

  // Phase 1 dispatch: fan out to transport-tagged volunteers with overlap.
  try {
    await dispatchJob('TransportRequest', created.id);
  } catch (err) {
    console.error('[transport:new] dispatchJob failed', err);
  }

  redirect('/transport');
}

export default async function NewTransportRequestPage() {
  await requireOperator();
  const [birds, volunteers] = await Promise.all([
    prisma.bird.findMany({ where: activeBirdWhere, orderBy: { name: 'asc' } }),
    prisma.transportVolunteer.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/transport" className="text-sm text-teal-700 hover:underline">← Transport</Link>
      <H1>New transport job</H1>
      <Card>
        <p className="text-sm text-gray-600 mb-4">
          Build a multi-stop transport. Leave any field blank if you don&apos;t know it
          yet — the request can be saved as a shell and filled in later.
        </p>
        <NewTransportForm
          action={createMultiStopRequest}
          birds={birds.map((b) => ({ id: b.id, name: b.name }))}
          volunteers={volunteers.map((v) => ({ id: v.id, name: v.name }))}
          urgencies={[...REQUEST_URGENCIES]}
          types={[...TRANSPORT_TYPES]}
        />
        <div className="mt-4 flex gap-2">
          <Btn href="/transport" variant="ghost">Cancel</Btn>
        </div>
      </Card>
    </div>
  );
}
