import React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant =
  | 'draft'
  | 'issued'
  | 'completed'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'settled'
  | 'active'
  | 'inactive'
  | 'voided'
  | 'closed'
  | 'reopened'
  | 'warning'
  | 'info';

interface BadgeProps {
  variant?: BadgeVariant | string;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'info', children, className, dot = true }) => {
  const variantStyles: Record<string, { bg: string; text: string; dotColor: string }> = {
    draft: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', dotColor: 'bg-amber-500' },
    issued: { bg: 'bg-sky-50 border-sky-200', text: 'text-sky-800', dotColor: 'bg-sky-500' },
    completed: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', dotColor: 'bg-emerald-500' },
    pending: { bg: 'bg-saffron-50 border-saffron-200', text: 'text-saffron-800', dotColor: 'bg-saffron-500' },
    pending_approval: { bg: 'bg-saffron-50 border-saffron-200', text: 'text-saffron-800', dotColor: 'bg-saffron-500' },
    approved: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', dotColor: 'bg-emerald-500' },
    settled: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', dotColor: 'bg-emerald-500' },
    active: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', dotColor: 'bg-emerald-500' },
    closed: { bg: 'bg-purple-50 border-purple-200', text: 'text-purple-800', dotColor: 'bg-purple-500' },
    reopened: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', dotColor: 'bg-amber-500' },
    voided: { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-800', dotColor: 'bg-rose-500' },
    rejected: { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-800', dotColor: 'bg-rose-500' },
    inactive: { bg: 'bg-gray-100 border-gray-200', text: 'text-gray-700', dotColor: 'bg-gray-400' },
    warning: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', dotColor: 'bg-amber-500' },
    info: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', dotColor: 'bg-blue-500' },
  };

  const style = variantStyles[variant] || variantStyles.info;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border',
        style.bg,
        style.text,
        className
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', style.dotColor)} />}
      {children}
    </span>
  );
};
