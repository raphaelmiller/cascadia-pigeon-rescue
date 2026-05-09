'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Trash2, Loader2 } from 'lucide-react';

/**
 * SwipeRow — iOS-style swipe-left to reveal Archive + Delete actions.
 *
 * Behavior
 *  - Touch (phone): drag card left to reveal action zones. Past commit
 *    threshold the row snaps fully open. Tap Archive or Delete to commit.
 *    Drag right or tap content to dismiss.
 *  - Mouse (desktop): same drag interaction with the trackpad / mouse.
 *  - Past hard threshold (~75% of card width) on release, auto-commits
 *    the destructive action with a confirm dialog. Deliberate-but-fast.
 *  - Pure presentational shell: caller provides children + entity URLs.
 *
 * Failure mode is non-destructive: every commit confirms before firing,
 * and Archive is restorable; Delete moves to /archive trash (still
 * restorable).
 */

const ACTIONS_WIDTH = 176; // pixels — width of the two-button reveal area
const COMMIT_THRESHOLD_RATIO = 0.6; // drag past 60% of actions width to "lock open"
const AUTO_COMMIT_RATIO = 1.5;       // drag past 1.5x actions width to auto-delete on release

export function SwipeRow({
  archiveUrl,
  deleteUrl,
  entityName,
  children,
  className = '',
}: {
  archiveUrl: string;
  deleteUrl: string;
  entityName: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drag, setDrag] = useState(0);   // negative = swiped left
  const [open, setOpen] = useState(false);
  const startX = useRef<number | null>(null);
  const movedX = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    // Don't start a swipe if the user is interacting with a link/button inside.
    const target = e.target as HTMLElement;
    if (target.closest('button, a[data-no-swipe="true"]')) return;
    startX.current = e.clientX;
    movedX.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (startX.current == null) return;
    const dx = e.clientX - startX.current;
    movedX.current = dx;
    // Resist swiping right past 0; allow a tiny bounce.
    let next = dx;
    if (open && dx > 0) next = -ACTIONS_WIDTH + dx;       // dragging right from open state
    if (!open && dx > 0) next = dx * 0.15;                // mild rubber-band
    if (next < -ACTIONS_WIDTH * AUTO_COMMIT_RATIO) {
      next = -ACTIONS_WIDTH * AUTO_COMMIT_RATIO;
    }
    setDrag(next);
  }

  function onPointerUp() {
    if (startX.current == null) return;
    const dx = movedX.current;
    const wasOpen = open;
    startX.current = null;

    // Auto-commit: dragged way past — treat as confirmed delete.
    if (dx <= -ACTIONS_WIDTH * AUTO_COMMIT_RATIO * 0.95) {
      setDrag(-ACTIONS_WIDTH);
      setOpen(true);
      // Slight delay so user sees the action drawer before confirm fires.
      setTimeout(() => commit('delete'), 80);
      return;
    }

    if (!wasOpen && dx <= -ACTIONS_WIDTH * COMMIT_THRESHOLD_RATIO) {
      // Snap fully open
      setOpen(true);
      setDrag(-ACTIONS_WIDTH);
      return;
    }
    if (wasOpen && dx > ACTIONS_WIDTH * 0.4) {
      // Dragged back right — close
      setOpen(false);
      setDrag(0);
      return;
    }
    // Otherwise snap to nearest state
    if (dx <= -ACTIONS_WIDTH * 0.3) {
      setOpen(true);
      setDrag(-ACTIONS_WIDTH);
    } else {
      setOpen(false);
      setDrag(0);
    }
  }

  function close() {
    setOpen(false);
    setDrag(0);
  }

  function commit(action: 'archive' | 'delete') {
    if (action === 'delete') {
      const ok = typeof window !== 'undefined'
        ? window.confirm(`Move "${entityName}" to trash?\n\nIt can be restored from Archive.`)
        : false;
      if (!ok) {
        close();
        return;
      }
    }
    const url = action === 'archive' ? archiveUrl : deleteUrl;
    startTransition(async () => {
      try {
        const res = await fetch(url, { method: 'POST' });
        if (!res.ok) throw new Error('Request failed');
        // Optimistically slide the row out, then refresh.
        setDrag(-1000);
        setTimeout(() => {
          setOpen(false);
          setDrag(0);
          router.refresh();
        }, 220);
      } catch (err) {
        console.error(err);
        close();
        alert('Something went wrong. The record was not changed.');
      }
    });
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden touch-pan-y select-none ${className}`}
    >
      {/* Action drawer behind the card */}
      <div
        className={`absolute inset-y-0 right-0 flex transition-opacity ${
          drag < -8 || open ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ width: ACTIONS_WIDTH }}
        aria-hidden={drag === 0 && !open}
      >
        <button
          type="button"
          onClick={() => commit('archive')}
          disabled={pending}
          className="flex-1 flex flex-col items-center justify-center bg-orange-500 text-white text-xs font-semibold gap-1 active:bg-orange-600 disabled:opacity-60"
        >
          {pending ? <Loader2 size={18} className="animate-spin" /> : <Archive size={18} />}
          Archive
        </button>
        <button
          type="button"
          onClick={() => commit('delete')}
          disabled={pending}
          className="flex-1 flex flex-col items-center justify-center bg-red-600 text-white text-xs font-semibold gap-1 active:bg-red-700 disabled:opacity-60"
        >
          {pending ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
          Delete
        </button>
      </div>

      {/* The card */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative bg-transparent will-change-transform transition-transform"
        style={{
          transform: `translate3d(${drag}px, 0, 0)`,
          transition: startX.current == null ? 'transform 220ms cubic-bezier(.2,.8,.2,1)' : 'none',
        }}
      >
        {/* When open, an invisible overlay catches taps to close the drawer
            without triggering inner Link clicks. */}
        {open && (
          <div
            className="absolute inset-0 z-10"
            onClick={(e) => { e.preventDefault(); close(); }}
          />
        )}
        {children}
      </div>

      {/* Hint chevron the first time the user can swipe (small + subtle). */}
      <div
        className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-300 transition-opacity ${
          drag === 0 && !open ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden
      >
        ◀ swipe
      </div>
    </div>
  );
}
