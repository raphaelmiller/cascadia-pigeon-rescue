import { format, formatDistanceToNow, isPast, differenceInDays } from 'date-fns';

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return format(dt, 'MMM d, yyyy');
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return format(dt, 'MMM d, yyyy · h:mm a');
}

export function fmtRelative(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return formatDistanceToNow(dt, { addSuffix: true });
}

export function daysUntil(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const dt = typeof d === 'string' ? new Date(d) : d;
  return differenceInDays(dt, new Date());
}

export function isOverdue(d: Date | string | null | undefined): boolean {
  if (!d) return false;
  const dt = typeof d === 'string' ? new Date(d) : d;
  return isPast(dt);
}

// Compute expected runout from start + days_supplied if not explicit.
export function computeRunout(
  startDate: Date | string,
  daysSupplied: number | null | undefined,
  explicit?: Date | string | null,
): Date | null {
  if (explicit) return new Date(explicit);
  if (!daysSupplied) return null;
  const start = new Date(startDate);
  return new Date(start.getTime() + daysSupplied * 24 * 60 * 60 * 1000);
}
