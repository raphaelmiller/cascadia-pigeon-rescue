// Daily volunteer digest.
//
// Computes "what's on your plate today" for one volunteer and renders
// a short SMS body. Sends one SMS per opted-in, non-disabled volunteer
// with a date-stamped dedupe key so re-running the same day is a no-op.

import { prisma } from '@/lib/prisma';
import { sendSms } from '@/lib/notify/sms';
import { getOpenAssignmentsFor } from './assignments-query';

export type DigestResult = {
  scanned: number;
  sent: number;
  skipped: number; // opted out or already sent today
  errors: number;
};

function todayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function sendDailyDigests(now: Date = new Date()): Promise<DigestResult> {
  const opted = await prisma.volunteerProfile.findMany({
    where: { digestEnabled: true, disabledAt: null, phone: { not: null } },
    select: { id: true, name: true, phone: true, fosterId: true },
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;
  const date = todayKey(now);

  for (const p of opted) {
    if (!p.phone) { skipped++; continue; }
    const assignments = await getOpenAssignmentsFor(p.id);
    const birdCount = p.fosterId
      ? await prisma.bird.count({
          where: { fosterId: p.fosterId, deletedAt: null, archivedAt: null },
        })
      : 0;

    // Skip silent days: zero assignments AND zero birds = nothing to digest.
    if (assignments.length === 0 && birdCount === 0) {
      skipped++;
      continue;
    }

    const lines: string[] = [`Good morning ${p.name.split(' ')[0]}.`];
    if (assignments.length > 0) {
      const urgent = assignments.filter(a => a.emergencyFlag).length;
      const claimed = assignments.filter(a => a.pointPersonIsMe).length;
      const open = assignments.length - claimed;
      const parts: string[] = [];
      if (urgent > 0) parts.push(`${urgent} emergency`);
      if (claimed > 0) parts.push(`${claimed} as Point Person`);
      if (open > 0) parts.push(`${open} open`);
      lines.push(`On your plate: ${parts.join(', ')}.`);
    }
    if (birdCount > 0) {
      lines.push(`${birdCount} bird${birdCount === 1 ? '' : 's'} in your care.`);
    }
    lines.push('Open the portal to act.');

    const body = lines.join(' ');
    const res = await sendSms({
      to: p.phone,
      tag: 'daily_digest',
      dedupeKey: `digest:${p.id}:${date}`,
      body,
    });
    if (res.ok) sent++;
    else errors++;
  }
  return { scanned: opted.length, sent, skipped, errors };
}
