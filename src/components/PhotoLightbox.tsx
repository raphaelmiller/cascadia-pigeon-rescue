'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * PhotoLightbox — full-screen overlay for a single photo.
 *
 * URL-driven: render this whenever ?photo=<id> is present on the bird detail
 * page. The component handles ESC-to-close + click-on-backdrop + lock body
 * scroll while open. The caller passes already-fetched photo metadata so
 * everything renders server-side; this component is just for the close
 * behaviors that require a client.
 */
export function PhotoLightbox({
  closeHref,
  imageUrl,
  alt,
  caption,
  notes,
  category,
  isProfile,
  isImage,
  meta,
  prevHref,
  nextHref,
  setProfileForm,
  deleteForm,
}: {
  closeHref: string;
  imageUrl: string;
  alt: string;
  caption: string | null;
  notes: string | null;
  category: 'general' | 'health' | 'vet';
  isProfile: boolean;
  isImage: boolean;
  meta: { createdAt: string; mimeType?: string | null; originalName?: string | null };
  prevHref?: string | null;
  nextHref?: string | null;
  setProfileForm?: React.ReactNode;
  deleteForm?: React.ReactNode;
}) {
  const router = useRouter();

  // Close on ESC, navigate prev/next with arrow keys, lock body scroll.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push(closeHref);
      if (e.key === 'ArrowLeft' && prevHref) router.push(prevHref);
      if (e.key === 'ArrowRight' && nextHref) router.push(nextHref);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [router, closeHref, prevHref, nextHref]);

  const tone =
    category === 'health' ? 'bg-orange-50 text-orange-900 ring-orange-200'
    : category === 'vet' ? 'bg-sky-50 text-sky-900 ring-sky-200'
    : 'bg-teal-50 text-teal-900 ring-teal-200';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop close — clicking outside the inner card closes the lightbox */}
      <Link
        href={closeHref}
        aria-label="Close"
        className="absolute inset-0"
      />

      <div className="relative z-10 w-full max-w-5xl max-h-[92vh] flex flex-col bg-white rounded-2xl overflow-hidden shadow-2xl">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-flex items-center gap-1 rounded-full text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 ring-1 ${tone}`}>
              {category === 'general' ? 'photo' : category === 'health' ? 'health record' : 'vet paperwork'}
            </span>
            {isProfile && (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-600 text-white text-[10px] font-semibold px-2 py-0.5">
                ★ profile
              </span>
            )}
            <span className="text-xs text-gray-500 truncate hidden sm:inline">
              {meta.originalName || ''}
            </span>
          </div>
          <Link
            href={closeHref}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-gray-700 hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </Link>
        </div>

        {/* Image area */}
        <div className="relative flex-1 min-h-0 bg-gray-900 flex items-center justify-center">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={alt}
              className="max-h-[60vh] max-w-full object-contain"
            />
          ) : (
            <div className="text-center text-gray-200 p-12">
              <div className="text-6xl mb-3">📄</div>
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-lg bg-white text-gray-900 px-4 py-2 text-sm font-medium hover:bg-gray-100"
              >
                Open document ↗
              </a>
              {meta.originalName && <div className="mt-3 text-xs text-gray-400">{meta.originalName}</div>}
            </div>
          )}

          {/* Prev / next arrows */}
          {prevHref && (
            <Link
              href={prevHref}
              aria-label="Previous"
              className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-10 w-10 rounded-full bg-black/50 text-white hover:bg-black/70 backdrop-blur"
            >
              ‹
            </Link>
          )}
          {nextHref && (
            <Link
              href={nextHref}
              aria-label="Next"
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-10 w-10 rounded-full bg-black/50 text-white hover:bg-black/70 backdrop-blur"
            >
              ›
            </Link>
          )}
        </div>

        {/* Caption + actions */}
        <div className="px-4 py-3 bg-white border-t border-gray-200 space-y-2 overflow-auto">
          {caption ? (
            <h3 className="text-base font-semibold text-gray-900">{caption}</h3>
          ) : (
            <h3 className="text-base font-medium text-gray-400 italic">No caption</h3>
          )}
          {notes && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{notes}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-[11px] text-gray-500">{meta.createdAt}</span>
            {meta.mimeType && <span className="text-[11px] text-gray-400">· {meta.mimeType}</span>}
            <div className="ml-auto flex items-center gap-2">
              {isImage && setProfileForm}
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-teal-700 hover:underline"
              >
                Open original ↗
              </a>
              {deleteForm}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
