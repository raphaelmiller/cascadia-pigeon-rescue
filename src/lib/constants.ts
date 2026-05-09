// Cascadia Pigeon Rescue — domain constants used across the app.

export const BIRD_STATUSES = [
  'needs_intake',
  'needs_foster',
  'in_foster',
  'at_vet',
  'quarantine',
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
  quarantine: 'Quarantine',
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
  quarantine: 'yellow',
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
// FOSTER REHAB SKILL CHECKLIST
// 17 skills — each maps to a Boolean field on Foster. Score = # checked / 17.
// Order is the order Rafa wrote them (preserved on purpose so muscle memory works).
// =====================================================================
export const REHAB_SKILLS: { key: string; label: string }[] = [
  { key: 'skillEnrichment',      label: 'Puts effort into enrichment' },
  { key: 'skillOralMeds',        label: 'Can give oral meds' },
  { key: 'skillSyringeFeed',     label: 'Can syringe feed' },
  { key: 'skillTubeFeed',        label: 'Can tube feed' },
  { key: 'skillQuarantine',      label: 'Solid understanding of quarantine procedures / hygiene' },
  { key: 'skillWoundCare',       label: 'Proficient at wound care' },
  { key: 'skillNeonates',        label: 'Neonates' },
  { key: 'skillFootBandages',    label: 'Proficient at foot bandages' },
  { key: 'skillBoots',           label: 'Proficient at boots' },
  { key: 'skillWingWraps',       label: 'Proficient at wing wraps' },
  { key: 'skillSubqFluids',      label: 'Can give subq fluids' },
  { key: 'skillIMInjections',    label: 'Can give IM injections' },
  { key: 'skillCompoundMeds',    label: 'Can compound meds' },
  { key: 'skillCropSwabsFecals', label: 'Can do crop swabs and fecals' },
  { key: 'skillCageTime',        label: 'Able to give birds sufficient time out of cage' },
  { key: 'skillBirdLights',      label: 'Has bird lights' },
  { key: 'skillSupplements',     label: 'Gives grit, vitamins, calcium, probiotics' },
];

export const REHAB_SKILLS_TOTAL = REHAB_SKILLS.length; // 17

export function rehabScore(foster: Record<string, unknown>): number {
  let n = 0;
  for (const s of REHAB_SKILLS) if (foster[s.key]) n++;
  return n;
}

export function rehabScoreTone(score: number): string {
  // 0–5 -> blue (room to grow), 6–11 -> yellow, 12–16 -> green, 17 -> purple
  if (score === REHAB_SKILLS_TOTAL) return 'purple';
  if (score >= 12) return 'green';
  if (score >= 6) return 'yellow';
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
