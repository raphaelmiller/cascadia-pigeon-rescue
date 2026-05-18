'use client';

/**
 * Tiny client wrapper that adds a window.confirm() guard around a
 * <button type="submit">. Drop it inside a server-rendered <form> that
 * targets a destructive server action — the button shows the supplied
 * message, and if the operator cancels we preventDefault() and the form
 * does not submit.
 *
 * Keeping it dumb on purpose: no state, no styling beyond className,
 * no fancy modal. Christina sees the same browser dialog she's used to.
 */
import type { ReactNode, FormEvent } from 'react';

export function ConfirmSubmit({
  message,
  children,
  className = '',
  title,
}: {
  message: string;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="submit"
      title={title}
      className={className}
      onClick={(e: FormEvent<HTMLButtonElement>) => {
        if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
