import { z } from 'zod';
import {
  BIRD_STATUSES, MEDICAL_PRIORITIES, REQUEST_URGENCIES, CALENDAR_TYPES,
  REHAB_PROFICIENCY, TRANSPORT_STATUSES, SHIFT_TYPES,
} from '@/lib/constants';

/**
 * Centralised input validators. Each server action calls one of these
 * with the raw FormData. zod parses, coerces, and rejects anything that
 * doesn't match the canonical enum. Failures throw a friendly error
 * surfaced via the global error.tsx boundary.
 *
 * No schema covers EVERY field of an entity — only the enum-shaped /
 * structurally-significant ones where bad data would corrupt UI logic.
 * Free-text fields are still passed straight through (Prisma escapes,
 * React escapes, no XSS surface).
 */

const trimmedString = z.string().trim();
const optionalString = trimmedString.optional().transform(v => (v && v.length > 0 ? v : null));
const optionalIso = z.string().optional().transform(v => (v ? new Date(v) : null));

// ---------------------------------------------------------------------
// Bird
// ---------------------------------------------------------------------
export const birdUpdateSchema = z.object({
  name: trimmedString.min(1).max(120).default('Unnamed'),
  status: z.enum(BIRD_STATUSES as unknown as [string, ...string[]]),
  medicalPriority: z.enum(MEDICAL_PRIORITIES as unknown as [string, ...string[]]),
  species: optionalString,
  age: optionalString,
  sex: z.enum(['M', 'F']).optional().or(z.literal('').transform(() => undefined))
    .transform(v => (v ? v : null)),
  weightGrams: z.coerce.number().positive().max(5000).nullable().optional()
    .transform(v => (typeof v === 'number' && !isNaN(v) ? v : null)),
  primaryDiagnosis: optionalString,
  medicalNotes: optionalString,
  dietNotes: optionalString,
  behaviorNotes: optionalString,
  specialHandling: optionalString,
  fosterId: optionalString,
});

// ---------------------------------------------------------------------
// Foster
// ---------------------------------------------------------------------
export const fosterUpdateSchema = z.object({
  name: trimmedString.min(1).max(120).default('Foster'),
  phone: optionalString,
  email: optionalString,
  address: optionalString,
  capacity: z.coerce.number().int().min(0).max(50).default(0),
  medicalSkill: z.enum(REHAB_PROFICIENCY as unknown as [string, ...string[]]),
  longTermAble: z.preprocess(v => v === 'on' || v === true || v === 'true', z.boolean()),
  canTransportSelf: z.preprocess(v => v === 'on' || v === true || v === 'true', z.boolean()),
  notes: optionalString,
});

// ---------------------------------------------------------------------
// Transport request
// ---------------------------------------------------------------------
export const transportRequestSchema = z.object({
  fromAddress: trimmedString.min(1).max(500),
  toAddress: trimmedString.min(1).max(500),
  pickupBy: z.string().min(1).transform(v => new Date(v)),
  deliverBy: optionalIso,
  urgency: z.enum(REQUEST_URGENCIES as unknown as [string, ...string[]]),
  status: z.enum(TRANSPORT_STATUSES as unknown as [string, ...string[]]).default('open'),
  description: optionalString,
  notes: optionalString,
  birdId: optionalString,
  volunteerId: optionalString,
});

// ---------------------------------------------------------------------
// Calendar event
// ---------------------------------------------------------------------
export const calendarEventSchema = z.object({
  title: trimmedString.min(1).max(200).default('Event'),
  type: z.enum(CALENDAR_TYPES as unknown as [string, ...string[]]),
  startsAt: z.string().min(1).transform(v => new Date(v)),
  birdId: optionalString,
  notes: optionalString,
});

// ---------------------------------------------------------------------
// Rescue shift
// ---------------------------------------------------------------------
export const rescueShiftSchema = z.object({
  shiftType: z.enum(SHIFT_TYPES as unknown as [string, ...string[]]),
  startsAt: z.string().min(1).transform(v => new Date(v)),
  endsAt: z.string().min(1).transform(v => new Date(v)),
  volunteerId: optionalString,
  area: optionalString,
  notes: optionalString,
});

// ---------------------------------------------------------------------
// Daily update
// ---------------------------------------------------------------------
export const dailyUpdateSchema = z.object({
  birdId: trimmedString.min(1),
  fosterId: trimmedString.min(1),
  healthStatus: optionalString,
  eatingDrinking: optionalString,
  poopQuality: optionalString,
  energyLevel: optionalString,
  medsAdministered: optionalString,
  stressLevel: z.coerce.number().int().min(1).max(10).nullable().optional()
    .transform(v => (typeof v === 'number' && !isNaN(v) ? v : null)),
  concerns: optionalString,
  whiteboardUpdate: optionalString,
  notes: optionalString,
});

// ---------------------------------------------------------------------
// Helper — read all fields from FormData into a plain record. Skips
// File entries (those go through the upload helpers separately).
// ---------------------------------------------------------------------
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      // For repeating keys (rare here), prefer the first non-empty.
      if (out[key] === undefined) out[key] = value;
    }
  }
  return out;
}

/** Parse + throw on failure with a readable message. */
export function parseForm<T extends z.ZodTypeAny>(schema: T, formData: FormData): z.infer<T> {
  const obj = formToObject(formData);
  const result = schema.safeParse(obj);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid form data — ${issues}`);
  }
  return result.data;
}
