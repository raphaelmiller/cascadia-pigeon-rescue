// Cascadia Pigeon Rescue — domain constants used across the app.

export const BIRD_STATUSES = [
  'needs_intake',
  'needs_foster',
  'in_foster',
  'at_vet',
  // 'quarantine' removed 2026-05-17 — quarantine is now tracked via
  // the Bird.currentlyQuarantined boolean alongside the clinical status,
  // and birds that were in quarantine have been migrated to medical_hold.
  'medical_hold',
  'needs_transfer',
  'adoption_ready',
  'adoption_pending',
  'adopted',
  'long_term_foster',
  'sanctuary',
  'transferred',
  'released',
  'deceased',
  'closed',
] as const;
export type BirdStatus = typeof BIRD_STATUSES[number];

export const STATUS_LABELS: Record<string, string> = {
  needs_intake: 'Needs Intake',
  needs_foster: 'Needs Foster',
  in_foster: 'In Foster',
  at_vet: 'At Vet',
  medical_hold: 'Medical Hold',
  needs_transfer: 'Needs Transfer',
  adoption_ready: 'Adoption Ready',
  adoption_pending: 'Adoption Pending',
  adopted: 'Adopted',
  long_term_foster: 'Long-Term Foster',
  sanctuary: 'Sanctuary',
  transferred: 'Transferred',
  released: 'Released',
  deceased: 'Deceased',
  closed: 'Closed',
};

// Color triage:
//  red    = urgent
//  orange = high concern
//  yellow = upcoming / elevated
//  green  = stable / manageable
//  blue   = low concern / low stress
//  purple = highly stable
export const STATUS_TONE: Record<string, string> = {
  needs_intake: 'red',
  needs_foster: 'orange',
  at_vet: 'orange',
  medical_hold: 'orange',
  needs_transfer: 'orange',
  in_foster: 'green',
  long_term_foster: 'green',
  adoption_ready: 'blue',
  adoption_pending: 'blue',
  adopted: 'purple',
  sanctuary: 'purple',
  transferred: 'purple',
  released: 'purple',
  deceased: 'gray',
  closed: 'gray',
};

export const MEDICAL_PRIORITIES = ['none', 'low', 'medium', 'high', 'critical'] as const;
export const PRIORITY_TONE: Record<string, string> = {
  none: 'gray',
  low: 'blue',
  medium: 'yellow',
  high: 'orange',
  critical: 'red',
};

export const REQUEST_TYPES = [
  'supply',
  'medication',
  'bandage',
  'transport',
  'vet',
  'food',
  'equipment',
  'other',
] as const;
export const REQUEST_URGENCIES = ['low', 'normal', 'high', 'urgent'] as const;
export const URGENCY_TONE: Record<string, string> = {
  low: 'blue',
  normal: 'green',
  high: 'orange',
  urgent: 'red',
};

export const REQUEST_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

export const CALENDAR_TYPES = [
  'vet',
  'bandage',
  'med_start',
  'med_stop',
  'med_reassess',
  'refill',
  'supply',
  'transfer',
  'adoption',
  'followup',
] as const;

// Foster rehab proficiency — was previously labeled "medical skill".
// Underlying field is still `medicalSkill` in the schema (no migration
// needed); we just changed the UI labels and options.
export const REHAB_PROFICIENCY = ['beginner', 'intermediate', 'advanced'] as const;
export const REHAB_PROFICIENCY_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  // legacy values still in DB — render gracefully
  none: 'Beginner',
  basic: 'Beginner',
};
// Legacy alias kept so old imports don't break during rollout.
export const MEDICAL_SKILLS = REHAB_PROFICIENCY;

// =====================================================================
// FOSTER SKILL & CARE ASSESSMENT (Rafa's tiered rubric, 2026-05-08)
// Two independent scores: Clinical Competency + Quality of Care.
// Each tier carries a point weight. Categories are derived from totals.
// =====================================================================

export type SkillItem = { key: string; label: string };
export type SkillTier = {
  id: string;
  title: string;
  pointsPer: number;
  scoreCategory: 'clinical' | 'quality';
  description?: string;
  items: SkillItem[];
};

export const SKILL_TIERS: SkillTier[] = [
  {
    id: 'basic',
    title: 'Basic Skills',
    pointsPer: 2,
    scoreCategory: 'clinical',
    items: [
      { key: 'skillOralMeds',    label: 'Can give oral medications' },
      { key: 'skillSyringeFeed', label: 'Can syringe feed' },
      { key: 'skillQuarantine',  label: 'Solid understanding of quarantine procedures / hygiene' },
    ],
  },
  {
    id: 'intermediate',
    title: 'Intermediate Skills',
    pointsPer: 3,
    scoreCategory: 'clinical',
    items: [
      { key: 'skillTubeFeed',     label: 'Can tube feed' },
      { key: 'skillCompoundMeds', label: 'Can compound medications safely and accurately' },
    ],
  },
  {
    id: 'advanced',
    title: 'Advanced Skills',
    pointsPer: 5,
    scoreCategory: 'clinical',
    items: [
      { key: 'skillWoundCare',    label: 'Proficient at wound care' },
      { key: 'skillFootBandages', label: 'Proficient at foot bandages' },
      { key: 'skillBoots',        label: 'Proficient at boots' },
      { key: 'skillWingWraps',    label: 'Proficient at wing wraps' },
    ],
  },
  {
    id: 'critical',
    title: 'Critical Care Skills',
    pointsPer: 8,
    scoreCategory: 'clinical',
    items: [
      { key: 'skillCropSwabsFecals',  label: 'Can perform crop swabs and fecals' },
      { key: 'skillCropFlushes',      label: 'Can perform crop flushes' },
      { key: 'skillIMInjections',     label: 'Can give IM injections' },
      { key: 'skillSubqFluids',       label: 'Can administer subq fluids' },
      { key: 'skillNeonates',         label: 'Experienced with neonates' },
      { key: 'skillMedKnowledge',     label: 'Thorough understanding of common pigeon medications, treatment purposes, and safe administration' },
      { key: 'skillEmaciationCare',   label: 'Strong understanding of severe emaciation / starvation care, including refeeding safety, gradual nutritional rehabilitation, hydration support, crop monitoring, and stabilization protocols' },
    ],
  },
  {
    id: 'quality',
    title: 'Quality of Care',
    pointsPer: 2,
    scoreCategory: 'quality',
    items: [
      { key: 'skillBirdLights',  label: 'Has bird lights' },
      { key: 'skillSupplements', label: 'Provides grit, calcium, vitamins, probiotics' },
      { key: 'skillCageTime',    label: 'Able to provide sufficient time out of cage' },
      { key: 'skillEnrichment',  label: 'Puts consistent effort into enrichment' },
    ],
  },
];

// All checkable skill keys (used by form action handlers to know which booleans to read).
export const ALL_SKILL_KEYS: string[] = SKILL_TIERS.flatMap(t => t.items.map(i => i.key));

// Maximum possible scores (used for progress bars).
export const MAX_CLINICAL = SKILL_TIERS
  .filter(t => t.scoreCategory === 'clinical')
  .reduce((sum, t) => sum + t.items.length * t.pointsPer, 0); // 6 + 6 + 20 + 48 = 80
export const MAX_QUALITY = SKILL_TIERS
  .filter(t => t.scoreCategory === 'quality')
  .reduce((sum, t) => sum + t.items.length * t.pointsPer, 0); // 8

// Skill scoring accepts any object that has the boolean skill keys.
// Prisma's Foster row is the production caller; tests may pass a partial
// stub. Using a generic preserves type safety at the call site without
// forcing every caller to do an `as unknown as` double-cast.
type FosterLike = Record<string, unknown>;

export function clinicalScore(foster: FosterLike): number {
  let total = 0;
  for (const tier of SKILL_TIERS) {
    if (tier.scoreCategory !== 'clinical') continue;
    for (const item of tier.items) {
      if (foster[item.key]) total += tier.pointsPer;
    }
  }
  return total;
}

export function qualityScore(foster: FosterLike): number {
  let total = 0;
  for (const tier of SKILL_TIERS) {
    if (tier.scoreCategory !== 'quality') continue;
    for (const item of tier.items) {
      if (foster[item.key]) total += tier.pointsPer;
    }
  }
  return total;
}

// ----- Categorization (Rafa's bands) -----
export type ClinicalCategory =
  | 'Basic Foster' | 'Medical Foster' | 'Advanced Rehab Foster' | 'Critical Care Foster';

export function clinicalCategory(score: number): ClinicalCategory {
  if (score >= 41) return 'Critical Care Foster';
  if (score >= 25) return 'Advanced Rehab Foster';
  if (score >= 11) return 'Medical Foster';
  return 'Basic Foster';
}

export function clinicalCategoryTone(score: number): string {
  if (score >= 41) return 'purple';
  if (score >= 25) return 'green';
  if (score >= 11) return 'blue';
  return 'gray';
}

export type QualityCategory = 'Minimal' | 'Good' | 'Excellent';

export function qualityCategory(score: number): QualityCategory {
  // Bands: 0-2 Minimal | 4-6 Good | 8 Excellent
  if (score >= 8) return 'Excellent';
  if (score >= 4) return 'Good';
  return 'Minimal';
}

export function qualityCategoryTone(score: number): string {
  if (score >= 8) return 'purple';
  if (score >= 4) return 'green';
  if (score >= 2) return 'yellow';
  return 'gray';
}

// ---------------------------------------------------------------------
// Legacy compatibility shims so other pages that imported the old
// `REHAB_SKILLS` / `rehabScore` continue to compile. They map to the
// clinical+quality combined view.
// ---------------------------------------------------------------------
export const REHAB_SKILLS: SkillItem[] = SKILL_TIERS.flatMap(t => t.items);
export const REHAB_SKILLS_TOTAL = REHAB_SKILLS.length;
export function rehabScore(foster: Record<string, unknown>): number {
  return clinicalScore(foster) + qualityScore(foster);
}
export function rehabScoreTone(score: number): string {
  if (score >= 60) return 'purple';
  if (score >= 30) return 'green';
  if (score >= 10) return 'yellow';
  if (score >= 1) return 'blue';
  return 'gray';
}

// Foster stress → color tone (the brief asks for an exact 6-color ramp)
export function stressTone(level: number | null | undefined): string {
  if (level == null) return 'gray';
  if (level <= 1) return 'purple';     // fully stable
  if (level <= 3) return 'blue';       // low stress
  if (level <= 5) return 'green';      // manageable
  if (level <= 7) return 'yellow';     // elevated
  if (level <= 8) return 'orange';     // high strain
  return 'red';                        // 9-10 severe burnout risk
}

export function stressLabel(level: number | null | undefined): string {
  if (level == null) return 'Unknown';
  if (level <= 1) return 'Fully stable';
  if (level <= 3) return 'Low stress';
  if (level <= 5) return 'Manageable';
  if (level <= 7) return 'Elevated';
  if (level <= 8) return 'High strain';
  return 'Severe burnout risk';
}

export const TONE_BG: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-400',
  green: 'bg-emerald-500',
  blue: 'bg-sky-500',
  purple: 'bg-violet-500',
  gray: 'bg-gray-400',
};

export const TONE_BG_SOFT: Record<string, string> = {
  red: 'bg-red-50 text-red-800 ring-red-200',
  orange: 'bg-orange-50 text-orange-800 ring-orange-200',
  yellow: 'bg-yellow-50 text-yellow-800 ring-yellow-200',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  blue: 'bg-sky-50 text-sky-800 ring-sky-200',
  purple: 'bg-violet-50 text-violet-800 ring-violet-200',
  gray: 'bg-gray-50 text-gray-700 ring-gray-200',
};

export const TONE_BORDER: Record<string, string> = {
  red: 'border-red-300',
  orange: 'border-orange-300',
  yellow: 'border-yellow-300',
  green: 'border-emerald-300',
  blue: 'border-sky-300',
  purple: 'border-violet-300',
  gray: 'border-gray-200',
};

// Phase 2 enums
export const TRANSPORT_STATUSES = ['open', 'assigned', 'in_transit', 'delivered', 'cancelled'] as const;
export const TRANSPORT_STATUS_TONE: Record<string, string> = {
  open: 'orange',
  assigned: 'yellow',
  in_transit: 'blue',
  delivered: 'green',
  cancelled: 'gray',
};

export const SHIFT_TYPES = ['on_call', 'active', 'emergency_backup'] as const;
export const SHIFT_TYPE_TONE: Record<string, string> = {
  on_call: 'blue',
  active: 'green',
  emergency_backup: 'orange',
};

export const SUPPLY_CATEGORIES = ['food', 'medical', 'housing', 'cleaning', 'paperwork', 'other'] as const;

// PR D: Rescue case status workflow.
// PR J (2026-05-24): added 'deceased' as a fourth resolution (bird found
// already deceased, or died at the scene). Creates a Bird record with
// status='deceased' for memorial / informational tracking.
export const RESCUE_CASE_STATUSES = [
  'needs_rescue',
  'rescued',
  'escaped_flew_away',
  'closed_unable',
  'deceased',
] as const;
export const RESCUE_CASE_STATUS_LABEL: Record<string, string> = {
  needs_rescue: '🚨 Needs rescue',
  rescued: '✅ Rescued',
  escaped_flew_away: '💨 Escaped',
  closed_unable: '❌ Closed',
  deceased: '⚰️ Deceased',
};
export const RESCUE_CASE_STATUS_TONE: Record<string, string> = {
  needs_rescue: 'red',
  rescued: 'green',
  escaped_flew_away: 'yellow',
  closed_unable: 'gray',
  deceased: 'gray',
};

// PR G (2026-05-19) — Current Whereabouts categories.
// Logged as entries in WhereaboutsLogEntry; latest entry wins.
// "Current whereabouts" derivation in src/lib/whereabouts.ts falls back
// to Bird.status when no log entries exist (avoids backfill).
export const WHEREABOUTS_CATEGORIES = [
  'adopted',
  'in_foster_care',
  'at_sanctuary',
  'at_wildlife_center',
  'deceased',
  'other',
] as const;
export type WhereaboutsCategory = typeof WHEREABOUTS_CATEGORIES[number];

export const WHEREABOUTS_LABELS: Record<string, string> = {
  adopted: 'Adopted',
  in_foster_care: 'In foster care',
  at_sanctuary: 'At a sanctuary',
  at_wildlife_center: 'At a wildlife center',
  deceased: 'Deceased',
  other: 'Other',
};

// UI tone hint (matches the Card/Badge tone vocabulary used elsewhere).
export const WHEREABOUTS_TONE: Record<string, string> = {
  adopted: 'green',
  in_foster_care: 'blue',
  at_sanctuary: 'purple',
  at_wildlife_center: 'orange',
  deceased: 'gray',
  other: 'gray',
};
