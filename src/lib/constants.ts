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

export const MEDICAL_SKILLS = ['none', 'basic', 'intermediate', 'advanced'] as const;

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
