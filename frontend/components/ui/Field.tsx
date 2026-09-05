import { cn } from '@/lib/cn';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="text-[11px] font-bold tracking-wide text-ink-soft uppercase">
          {label}
        </label>
      )}
      {children}
      {hint && !error && <span className="text-[12px] text-ink-faint">{hint}</span>}
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </div>
  );
}

const inputBase =
  'h-[42px] w-full rounded-[9px] border border-border bg-surface px-3.5 text-[13.5px] text-ink placeholder:text-ink-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-60';

// React 19: function components accept `ref` as a plain prop, no
// forwardRef needed -- just typed explicitly since InputHTMLAttributes
// doesn't include it.
export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(inputBase, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(inputBase, 'h-auto min-h-[100px] py-2.5 resize-y', className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputBase, className)} {...props} />;
}
