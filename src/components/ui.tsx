'use client';
import { TONE_BG, TONE_BG_SOFT, TONE_BORDER } from '@/lib/constants';

export function StatusDot({ tone, size = 'md' }: { tone: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'h-2.5 w-2.5' : size === 'lg' ? 'h-4 w-4' : 'h-3 w-3';
  return <span className={`inline-block rounded-full ${TONE_BG[tone] || 'bg-gray-300'} ${sz}`} aria-hidden />;
}

export function Pill({ tone = 'gray', children }: { tone?: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        TONE_BG_SOFT[tone] || TONE_BG_SOFT.gray
      }`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = '',
  tone = 'gray',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  tone?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`rounded-2xl bg-white shadow-sm border ${TONE_BORDER[tone] || 'border-gray-200'} p-4 md:p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function StatRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b last:border-0 border-gray-100">
      <span className="text-sm text-gray-600">{label}</span>
      <span
        className={`text-sm font-semibold ${
          tone === 'red'
            ? 'text-red-700'
            : tone === 'orange'
            ? 'text-orange-700'
            : tone === 'yellow'
            ? 'text-yellow-700'
            : tone === 'green'
            ? 'text-emerald-700'
            : 'text-gray-900'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
      {msg}
    </div>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{children}</h1>;
}
export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-gray-700 uppercase tracking-wide">{children}</h2>;
}

export function Btn({
  href,
  onClick,
  variant = 'primary',
  type = 'button',
  children,
  className = '',
  disabled = false,
}: {
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50';
  const styles =
    variant === 'primary'
      ? 'bg-teal-600 text-white hover:bg-teal-700'
      : variant === 'danger'
      ? 'bg-red-600 text-white hover:bg-red-700'
      : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50';
  if (href) {
    return (
      <a href={href} className={`${base} ${styles} ${className}`}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';
