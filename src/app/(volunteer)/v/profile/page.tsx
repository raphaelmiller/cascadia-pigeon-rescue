// Volunteer profile -- read-and-edit. Sections rendered conditionally
// based on which role-table records are linked.

import { requireVolunteer } from '@/lib/volunteer/auth';
import { ROLE_LABELS, type RoleTag } from '@/lib/volunteer/roles';
import { prisma } from '@/lib/prisma';
import { saveProfile, requestEmailChange } from './actions';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const sp = await searchParams;
  const v = await requireVolunteer();
  const [foster, transport, rescue] = await Promise.all([
    v.fosterId    ? prisma.foster.findUnique({ where: { id: v.fosterId } })             : null,
    v.transportId ? prisma.transportVolunteer.findUnique({ where: { id: v.transportId } }) : null,
    v.rescueId    ? prisma.rescueVolunteer.findUnique({ where: { id: v.rescueId } })    : null,
  ]);
  const profile = await prisma.volunteerProfile.findUnique({ where: { id: v.profileId } });
  if (!profile) return null;

  const displayedTags = v.roleTags.filter(t => t !== 'coordinator');
  const inputC = 'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm';
  const labelC = 'block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1';

  return (
    <div className="space-y-4">
      {sp.msg && (
        <div className={`rounded-xl ring-1 px-3 py-2 text-sm ${
          sp.msg === 'saved' || sp.msg === 'email_requested'
            ? 'bg-emerald-50 ring-emerald-200 text-emerald-900'
            : 'bg-amber-50 ring-amber-200 text-amber-900'
        }`}>
          {sp.msg === 'saved' && '✅ Profile saved.'}
          {sp.msg === 'invalid_name' && '⚠️ Name must be at least 2 characters.'}
          {sp.msg === 'invalid_email' && '⚠️ That doesn\u2019t look like a valid email.'}
          {sp.msg === 'email_requested' && '✅ Email-change request sent. A coordinator will follow up.'}
        </div>
      )}

      {/* Identity + roles -- read-only header */}
      <div className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5">
        <h1 className="text-xl font-semibold text-gray-900">{profile.name}</h1>
        <p className="text-sm text-gray-600 mt-0.5">{profile.email}</p>
        {(displayedTags.length > 0 || v.isCoordinator) && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {displayedTags.map((t: RoleTag) => (
              <span key={t} className="text-[11px] rounded-full px-2 py-0.5 bg-teal-50 text-teal-800 ring-1 ring-teal-200">
                {ROLE_LABELS[t]}
              </span>
            ))}
            {v.isCoordinator && (
              <span className="text-[11px] rounded-full px-2 py-0.5 bg-violet-50 text-violet-800 ring-1 ring-violet-200">
                Coordinator
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main edit form */}
      <form action={saveProfile} className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Your info</h2>

        <label className="block">
          <span className={labelC}>Name</span>
          <input
            type="text"
            name="name"
            defaultValue={profile.name}
            required
            minLength={2}
            maxLength={120}
            className={inputC}
          />
        </label>

        <label className="block">
          <span className={labelC}>Phone (for SMS alerts)</span>
          <input
            type="tel"
            name="phone"
            defaultValue={profile.phone ?? ''}
            placeholder="+15035551234"
            className={inputC}
          />
          <span className="text-[11px] text-gray-500 mt-1 block">
            E.164 format (with + and country code) so SMS dispatch can reach you.
          </span>
        </label>

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name="digestEnabled"
            value="1"
            defaultChecked={!!profile.digestEnabled}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <span className="text-sm">
            <span className="font-medium text-gray-900">Daily digest SMS</span>
            <span className="block text-[11px] text-gray-600 mt-0.5">
              One short SMS each morning summarizing what’s on your plate. Easy to turn off later.
            </span>
          </span>
        </label>

        {transport && (
          <fieldset className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-blue-800 px-1">🚚 Transport details</legend>
            <label className="block">
              <span className={labelC}>Vehicle type</span>
              <input
                type="text"
                name="vehicleType"
                defaultValue={transport.vehicleType ?? ''}
                placeholder="Sedan / SUV / Van / Pickup"
                className={inputC}
              />
            </label>
            <label className="block">
              <span className={labelC}>Max distance (miles)</span>
              <input
                type="number"
                name="maxDistanceMi"
                defaultValue={transport.maxDistanceMi ?? ''}
                min={0}
                max={1000}
                className={inputC}
              />
            </label>
            <label className="block">
              <span className={labelC}>General location</span>
              <input
                type="text"
                name="transportLocation"
                defaultValue={transport.location ?? ''}
                placeholder="NE Portland"
                className={inputC}
              />
            </label>
          </fieldset>
        )}

        {rescue && (
          <fieldset className="rounded-lg border border-red-200 bg-red-50/40 p-3 space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-red-800 px-1">🚨 Rescue details</legend>
            <label className="block">
              <span className={labelC}>Skills</span>
              <textarea
                name="rescueSkills"
                defaultValue={rescue.skills ?? ''}
                rows={3}
                placeholder="Climbing, netting, ladder work, basic first-aid…"
                className={inputC}
              />
            </label>
            <label className="block">
              <span className={labelC}>General location</span>
              <input
                type="text"
                name="rescueLocation"
                defaultValue={rescue.location ?? ''}
                placeholder="SE Portland"
                className={inputC}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="emergencyResponse"
                value="1"
                defaultChecked={!!rescue.emergencyResponse}
                className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              I&apos;m willing to be paged for emergency rescues
            </label>
          </fieldset>
        )}

        {foster && (
          <fieldset className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-1 text-sm text-gray-700">
            <legend className="text-xs font-semibold uppercase tracking-wide text-emerald-800 px-1">🐦 Foster details</legend>
            <p className="text-xs text-gray-700">
              Capacity ({foster.capacity}), rehab proficiency ({foster.medicalSkill}),
              and skill checklist are managed by a coordinator. Message Christina if any of those need to change.
            </p>
          </fieldset>
        )}

        <div>
          <button type="submit" className="rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm px-4 py-2">
            Save
          </button>
        </div>
      </form>

      {/* Email change request -- separate form because it goes through a
          coordinator approval path. */}
      <form action={requestEmailChange} className="rounded-2xl bg-white shadow ring-1 ring-gray-200 p-5 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Change sign-in email</h2>
        <p className="text-xs text-gray-600">
          Email is your sign-in key, so we don&apos;t change it instantly. Submit the request and a coordinator will follow up.
        </p>
        <label className="block">
          <span className={labelC}>New email</span>
          <input
            type="email"
            name="newEmail"
            className={inputC}
            placeholder="you@example.com"
            required
          />
        </label>
        <button type="submit" className="rounded-lg bg-white hover:bg-gray-50 text-gray-700 font-medium text-sm px-4 py-2 ring-1 ring-gray-300">
          Request email change
        </button>
      </form>
    </div>
  );
}
