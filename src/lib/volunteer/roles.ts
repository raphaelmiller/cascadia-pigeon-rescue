// Volunteer role tags.
//
// Per Christina's inline notes: roles are TAGS, not modes. A volunteer
// can wear any combination of these. The portal renders sections based
// on which tags match, organized by activity type (rescue / transport
// / foster / coordination) not by role label.
//
// The vocabulary below is the initial 13 from the spec. Adding new
// tags is a code change here, not a migration \u2014 the storage is a
// freeform comma-separated string on VolunteerProfile.roleTags.

export const ROLE_TAGS = [
  // ---- Hands-on activity tags ----
  'foster',           // takes birds into their home
  'lead_foster',      // experienced foster, mentors others
  'transport',        // driver
  'rescue',           // field rescuer
  'rescue_lead',      // experienced rescuer, on-call point person
  'med_admin',        // can administer medications
  'intake',           // helps with bird intake / triage at HQ
  // ---- Operational tags ----
  'coordinator',      // dispatches + reviews; has admin-portal access
  'vet_liaison',      // coordinates with vets / paperwork
  'supply_runner',    // picks up / delivers supplies
  'social_media',     // marketing / outreach
  'fundraising',      // donations / events
  'data_entry',       // helps Christina with paperwork
] as const;

export type RoleTag = typeof ROLE_TAGS[number];

export const ROLE_LABELS: Record<RoleTag, string> = {
  foster: 'Foster',
  lead_foster: 'Lead Foster',
  transport: 'Transport / Driver',
  rescue: 'Rescue',
  rescue_lead: 'Rescue Lead',
  med_admin: 'Medication Admin',
  intake: 'Intake',
  coordinator: 'Coordinator',
  vet_liaison: 'Vet Liaison',
  supply_runner: 'Supply Runner',
  social_media: 'Social Media',
  fundraising: 'Fundraising',
  data_entry: 'Data Entry',
};

// Activity groupings used by the portal to bucket the dashboard.
export const ACTIVITY_BUCKETS: Record<string, RoleTag[]> = {
  rescue: ['rescue', 'rescue_lead'],
  transport: ['transport'],
  foster: ['foster', 'lead_foster', 'med_admin'],
  coordination: ['coordinator', 'vet_liaison', 'data_entry'],
  outreach: ['social_media', 'fundraising', 'supply_runner', 'intake'],
};

export function parseRoleTags(s: string | null | undefined): RoleTag[] {
  if (!s) return [];
  const set = new Set<RoleTag>();
  for (const part of s.split(',')) {
    const trimmed = part.trim() as RoleTag;
    if ((ROLE_TAGS as readonly string[]).includes(trimmed)) set.add(trimmed);
  }
  return Array.from(set);
}

export function serializeRoleTags(tags: Iterable<RoleTag | string>): string {
  const valid: RoleTag[] = [];
  for (const t of tags) {
    if ((ROLE_TAGS as readonly string[]).includes(t)) valid.push(t as RoleTag);
  }
  // Stable order for consistent storage.
  return ROLE_TAGS.filter(t => valid.includes(t)).join(',');
}

export function hasRole(roleTags: string, want: RoleTag): boolean {
  return parseRoleTags(roleTags).includes(want);
}

export function hasAnyRole(roleTags: string, want: RoleTag[]): boolean {
  const have = new Set(parseRoleTags(roleTags));
  return want.some(r => have.has(r));
}

/** Which activity buckets does this volunteer participate in? */
export function activitiesFor(roleTags: string): string[] {
  const tags = new Set(parseRoleTags(roleTags));
  const out: string[] = [];
  for (const [bucket, members] of Object.entries(ACTIVITY_BUCKETS)) {
    if (members.some(m => tags.has(m))) out.push(bucket);
  }
  return out;
}
