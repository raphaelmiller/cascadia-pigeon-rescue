// StatusRailCard.tsx (PR K, 2026-05-31)
//
// The visual primitive that defines the new operations-console look.
// A card with a vertical color rail on the left (with a rotated status
// word) and a tinted body. Used by AssignmentCard, HistoryRow, dispatch
// cards, and anywhere else status-bearing rows live.
//
// Why a primitive instead of inlining the styles: there are at least 6
// places this exact shape needs to appear. Keeping the rail width + rotation
// + tint mapping in ONE file means the design language stays consistent
// when we add the 7th place tomorrow.

import * as React from 'react';

export type StatusRailTone = 'emergency' | 'rescue' | 'assigned' | 'warning' | 'info';

const TONE_TO_LABEL: Record<StatusRailTone, string> = {
  emergency: 'EMERGENCY',
  rescue:    'RESCUE',
  assigned:  'RESCUE\u00a0ASSIGNED',  // non-breaking space so the rotated label doesn't wrap
  warning:   'NEEDS\u00a0ATTENTION',
  info:      'INFO',
};

export interface StatusRailCardProps {
  tone: StatusRailTone;
  /** Optional override for the rotated rail label. Defaults to the tone's standard label. */
  label?: string;
  /** Whether to render a rail label at all. Default true. */
  showLabel?: boolean;
  /** Card body content. */
  children: React.ReactNode;
  /** Extra classes to merge onto the outer wrapper (e.g., for spacing). */
  className?: string;
  /** Extra classes for the body container (e.g., to opt out of default padding). */
  bodyClassName?: string;
}

export function StatusRailCard({
  tone,
  label,
  showLabel = true,
  children,
  className = '',
  bodyClassName = '',
}: StatusRailCardProps) {
  const labelText = label ?? TONE_TO_LABEL[tone];
  return (
    <div className={`status-rail-card ring-1 ring-gray-200 ${className}`}>
      <div className={`status-rail status-rail--${tone}`} aria-hidden="true">
        {showLabel && (
          <span className="status-rail-label">{labelText}</span>
        )}
      </div>
      <div className={`status-rail-card-body status-rail-card-body--${tone} ${bodyClassName}`}>
        {children}
      </div>
    </div>
  );
}
