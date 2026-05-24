// Admin: VolunteerProfile management list.

import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireOperator } from '@/lib/auth';
import { H1, Card, Btn } from '@/components/ui';
import { ROLE_TAGS, ROLE_LABELS, parseRoleTags, type RoleTag, serializeRoleTags } from '@/lib/volunteer/roles';
import { createVolunteerProfile } from './actions';
import { SystemStatusBanner } from '@/components/volunteer/SystemStatusBanner';
import { fmtDate } from '@/lib/utils';
import { UserPlus, Shield } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function VolunteersPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; new?: string }>;
}) {
  await requireOperator();
  const sp = await searchParams;
  const volunteers = await prisma.volunteerProfile.findMany({
    orderBy: [{ disabledAt: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { events: true, magicLinks: true } } },
  });

  return (
    <div className="space-y-4">
      <SystemStatusBanner />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <H1>Volunteer profiles</H1>
        <div className="flex gap-2">
          <Btn href="/volunteers/rules" variant="ghost">
            Point rules
          </Btn>
          <Btn href="/volunteers?new=1" variant="primary">
            <UserPlus size={16} /> Onboard volunteer
          </Btn>
        </div>
      </div>

      {sp.msg && (
        <div className={`rounded-xl ring-1 px-3 py-2 text-sm ${
          ['created', 'saved', 'disabled', 'enabled', 'relinked'].includes(sp.msg)
            ? 'bg-emerald-50 ring-emerald-200 text-emerald-900'
            : 'bg-amber-50 ring-amber-200 text-amber-900'
        }`}>
          {sp.msg === 'created' && '✅ Volunteer onboarded.'}
          {sp.msg === 'invalid_input' && '⚠️ Name + email are required.'}
          {sp.msg === 'email_in_use' && '⚠️ A profile with that email already exists.'}
        </div>
      )}

      {sp.new === '1' && (
        <Card>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Onboard a new volunteer</h2>
          <form action={createVolunteerProfile} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label>
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Name *</span>
                <input name="name" required minLength={2} className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
              </label>
              <label>
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Email *</span>
                <input name="email" type="email" required className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
              </label>
              <label>
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1">Phone (E.164)</span>
                <input name="phone" type="tel" placeholder="+15035551234" className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
              </label>
              <label className="flex items-center gap-2 self-end pb-1">
                <input type="checkbox" name="isCoordinator" value="1" className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
                <span className="text-sm font-medium text-violet-800 inline-flex items-center gap-1">
                  <Shield size={14} /> Coordinator
                </span>
              </label>
            </div>
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Roles</legend>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ROLE_TAGS.map(t => (
                  <label key={t} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={`role_${t}`} value="1" className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                    {ROLE_LABELS[t]}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-[11px] text-gray-500">
              Auto-link to existing Foster / Transport / Rescue records will happen if their email matches.
            </p>
            <div className="flex gap-2">
              <Btn type="submit" variant="primary">Create profile</Btn>
              <Btn href="/volunteers" variant="ghost">Cancel</Btn>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <ul className="divide-y divide-gray-100">
          {volunteers.length === 0 && (
            <li className="py-3 text-sm text-gray-600">No volunteers onboarded yet. Click <strong>Onboard volunteer</strong> to add one.</li>
          )}
          {volunteers.map(v => {
            const tags = parseRoleTags(v.roleTags).filter(t => t !== 'coordinator');
            return (
              <li key={v.id} className={`py-3 flex items-start gap-3 ${v.disabledAt ? 'opacity-50' : ''}`}>
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/volunteers/${v.id}`} className="text-sm font-semibold text-gray-900 hover:underline">
                      {v.name}
                    </Link>
                    {v.isCoordinator && (
                      <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-violet-100 text-violet-900 inline-flex items-center gap-1">
                        <Shield size={10} /> Coordinator
                      </span>
                    )}
                    {v.disabledAt && (
                      <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-gray-200 text-gray-700">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600">{v.email} {v.phone && `· ${v.phone}`}</p>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.map(t => (
                        <span key={t} className="text-[10px] rounded-full px-1.5 py-0.5 bg-teal-50 text-teal-800 ring-1 ring-teal-200">
                          {ROLE_LABELS[t as RoleTag]}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-gray-500 mt-1">
                    {v._count.events} event{v._count.events === 1 ? '' : 's'} ·{' '}
                    {v.lastLoginAt ? `last login ${fmtDate(v.lastLoginAt)}` : 'never logged in'}
                  </p>
                </div>
                <Link href={`/volunteers/${v.id}`} className="text-xs text-teal-700 hover:underline">
                  Manage →
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
