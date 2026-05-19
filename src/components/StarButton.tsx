'use client';

// PR F: Tappable star for a bird (or any entity that gets the
// "fully sorted / handled" treatment). Used in two spots:
//
//   1. `/birds` list cards (top-right of each card) — must not bubble
//      to the parent <Link> that wraps the card body.
//   2. `/birds/[id]` detail header.
//
// Behavior:
//   - Optimistic UI: filled state flips immediately on tap.
//   - Calls the server action in the background.
//   - If the server returns ok:false, revert + show a brief shake.
//   - Stops both click + pointerdown propagation so the wrapping <Link>
//     never sees the event (otherwise the page navigates).

import { useState, useTransition } from 'react';
import { toggleBirdStar } from '@/app/birds/star-action';

export function StarButton({
  birdId,
  starred,
  size = 'md',
  className = '',
}: {
  birdId: string;
  starred: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const [optimistic, setOptimistic] = useState(starred);
  const [shake, setShake] = useState(false);
  const [, startTransition] = useTransition();

  const dimensions = {
    sm: { box: 'h-7 w-7', icon: 'text-base' },
    md: { box: 'h-9 w-9', icon: 'text-xl' },
    lg: { box: 'h-11 w-11', icon: 'text-2xl' },
  }[size];

  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const onClick = (e: React.MouseEvent) => {
    stop(e);
    const next = !optimistic;
    setOptimistic(next);
    startTransition(async () => {
      const res = await toggleBirdStar(birdId, next);
      if (!res.ok) {
        // Revert + briefly shake to signal failure.
        setOptimistic(!next);
        setShake(true);
        setTimeout(() => setShake(false), 400);
      }
    });
  };

  const filledClass = optimistic
    ? 'text-amber-400'
    : 'text-gray-300 hover:text-amber-300';

  const shakeClass = shake ? 'animate-pulse ring-2 ring-red-400' : '';

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={stop}
      onTouchStart={stop}
      aria-label={optimistic ? 'Unmark as fully sorted' : 'Mark as fully sorted'}
      aria-pressed={optimistic}
      title={optimistic ? 'Fully sorted (tap to unmark)' : 'Tap to mark as fully sorted'}
      className={`${dimensions.box} inline-flex items-center justify-center rounded-full bg-white/80 backdrop-blur ring-1 ring-gray-200 hover:ring-amber-300 hover:bg-amber-50 transition shadow-sm ${shakeClass} ${className}`}
    >
      <span className={`${dimensions.icon} ${filledClass} leading-none select-none`} aria-hidden="true">
        {optimistic ? '★' : '☆'}
      </span>
    </button>
  );
}
