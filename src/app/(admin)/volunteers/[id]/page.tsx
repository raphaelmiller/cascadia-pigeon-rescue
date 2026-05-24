// Admin: VolunteerProfile detail + edit.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { H1, Card, Btn } from '@/components/ui';
import { ROLE_TAGS, ROLE_LABELS, parseRoleTags } from '@/lib/volunteer/roles';
import { updateVolunteerProfile, setDisabled, relinkRoleRecord } from '../actions';
import { fmtDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function VolunteerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireOperator();
  const { id } = await params;
  const sp = await searchParams;

  const [profile, allFosters, allTransport, allRescue] = await Promise.all([
    prisma.volunteerProfile.findUnique({
      where: { id },
      include: {
        foster: true,
        transport: true,
        rescue: true,
        _count: { select: { events: true, magicLinks: true, assignments: true } },
      },
    }),
    prisma.foster.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } }),
    prisma.transportVolunteer.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } }),
    prisma.rescueVolunteer.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } }),
  ]);
  if (!profile) notFound();

  const tags = new Set(parseRoleTags(profile.roleTags));
  const recentEvents = await prisma.volunteerEvent.findMany({
    where: { profileId: id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return (
    <div className="space-y-4">
      <Link href="/volunteers" className="text-sm text-teal-700 hover:underline">← Volunteer list</Link>
      <H1>{profile.name}</H1>

      {sp.msg && (
        <div className={`rounded-xl ring-1 px-3 py-2 text-sm ${
          ['saved', 'enabled', 'disabled', 'relinked'].includes(sp.msg)
            ? 'bg-emerald-50 ring-emerald-200 text-emerald-900'
            : 'bg-amber-50 ring-amber-200 text-amber-900'
        }`}>
          {sp.msg === 'saved' && '✅ Saved.'}
          {sp.msg === 'disabled' && '🔒 Volunteer disabled.'}
          {sp.msg === 'enabled' && '✅ Volunteer re-enabled.'}
          {sp.msg === 'relinked' && '✅ Role record linked.'}
        </div>
      )}

      {profile.disabledAt && (
        <div className="rounded-xl ring-1 px-3 py-2 text-sm bg-gray-100 ring-gray-300 text-gray-700">
          🔒 Disabled on {fmtDateTime(profile.disabledAt)}. Magic-link sign-ins are blocked.
        </div>
      )}

      <Card>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Identity & roles</h2>
        <form action={updateVolunteerProfile} className="space-y-3">
          <input type="hidden" name="id" value={profile.id} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label>
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Name</span>
              <input name="name" defaultValue={profile.name} required minLength={2}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
            </label>
            <label>
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Email (sign-in)</span>
              <input value={profile.email} disabled
                className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700" />
            </label>
            <label>
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Phone</span>
              <input name="phone" type="tel" defaultValue={profile.phone ?? ''}
                placeholder="+15035551234"
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="flex items-center gap-2 self-end pb-1">
              <input type="checkbox" name="isCoordinator" value="1" defaultChecked={profile.isCoordinator}
                className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
              <span className="text-sm font-medium text-violet-800">Coordinator</span>
            </label>
          </div>
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Roles</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ROLE_TAGS.map(t => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={`role_${t}`} value="1" defaultChecked={tags.has(t)}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                  {ROLE_LABELS[t]}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <Btn type="submit" variant="primary">Save</Btn>
          </div>
        </form>
      </Card>

      {/* Linked role records */}
      <Card>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Linked role records</h2>
        <p className="text-xs text-gray-600 mb-3">
          The per-role data (capacity, vehicle, skills) lives on the Foster / Transport / Rescue tables. Auto-linked on create when emails match; relink here if needed.
        </p>
        <LinkPicker
          profileId={profile.id}
          kind="foster"
          label="Foster"
          currentId={profile.fosterId}
          currentName={profile.foster?.name ?? null}
          options={allFosters}
        />
        <LinkPicker
          profileId={profile.id}
          kind="transport"
          label="Transport"
          currentId={profile.transportId}
          currentName={profile.transport?.name ?? null}
          options={allTransport}
        />
        <LinkPicker
          profileId={profile.id}
          kind="rescue"
          label="Rescue"
          currentId={profile.rescueId}
          currentName={profile.rescue?.name ?? null}
          options={allRescue}
        />
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-base font-semibold text-gray-900">Recent activity</h2>
          <Btn href={`/volunteers/${profile.id}/seed`} variant="ghost">
            Seed historical points
          </Btn>
        </div>
        <p className="text-xs text-gray-600 mb-2">
          {profile._count.events} total events · {profile._count.assignments} assignments · {profile._count.magicLinks} magic links issued
        </p>
        {recentEvents.length === 0 ? (
          <p className="text-sm text-gray-600">No events yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentEvents.map(e => (
              <li key={e.id} className="py-2 text-xs">
                <span className="font-mono text-gray-500">{fmtDateTime(e.createdAt)}</span>
                {' · '}
                <span className="font-semibold text-gray-800">{e.kind}</span>
                {e.pointDelta !== 0 && <span className="ml-1 text-emerald-700">{e.pointDelta > 0 ? '+' : ''}{e.pointDelta}pt</span>}
                {' · '}
                <span className="text-gray-500">{e.approvalStatus}</span>
                {e.notes && <p className="text-gray-700 mt-0.5">{e.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Danger zone</h2>
        <form action={setDisabled} className="flex gap-2 items-center">
          <input type="hidden" name="id" value={profile.id} />
          {profile.disabledAt ? (
            <>
              <input type="hidden" name="action" value="enable" />
              <button type="submit" className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3 py-1.5">
                Re-enable volunteer
              </button>
              <p className="text-xs text-gray-600">Re-enabling allows them to sign in again.</p>
            </>
          ) : (
            <>
              <input type="hidden" name="action" value="disable" />
              <button type="submit" className="rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-3 py-1.5">
                Disable volunteer
              </button>
              <p className="text-xs text-gray-600">Disabling blocks future magic-link sign-ins. History is preserved.</p>
            </>
          )}
        </form>
      </Card>
    </div>
  );
}

function LinkPicker({
  profileId, kind, label, currentId, currentName, options,
}: {
  profileId: string;
  kind: 'foster' | 'transport' | 'rescue';
  label: string;
  currentId: string | null;
  currentName: string | null;
  options: { id: string; name: string; email: string | null }[];
}) {
  return (
    <form action={relinkRoleRecord} className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-b-0">
      <input type="hidden" name="id" value={profileId} />
      <input type="hidden" name="kind" value={kind} />
      <span className="text-sm font-medium text-gray-700 w-24">{label}:</span>
      <select name="targetId" defaultValue={currentId ?? ''}
        className="flex-grow rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm">
        <option value="">— Not linked —</option>
        {options.map(o => (
          <option key={o.id} value={o.id}>{o.name}{o.email ? ` (${o.email})` : ''}</option>
        ))}
      </select>
      {currentName && currentId !== null && <span className="text-[11px] text-gray-500">current: {currentName}</span>}
      <button type="submit" className="rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium px-2.5 py-1 ring-1 ring-gray-300">
        Save
      </button>
    </form>
  );
}
