import { cn } from '@/lib/cn';
import type { ButtonHTMLAttributes } from 'react';

interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function Pill({ active, className, ...props }: PillProps) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors cursor-pointer',
        active
          ? 'border-accent bg-accent text-white'
          : 'border-border bg-surface text-ink-soft hover:border-accent-soft-border',
        className,
      )}
      {...props}
    />
  );
}
