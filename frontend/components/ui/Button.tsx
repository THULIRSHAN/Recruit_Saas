import { cn } from '@/lib/cn';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'bg-surface text-ink border border-border hover:bg-surface-alt',
  ghost: 'bg-transparent text-ink-soft hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90',
  success: 'bg-success text-white hover:opacity-90',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12.5px] gap-1.5',
  md: 'h-[38px] px-4 text-[13.5px] gap-2',
  lg: 'h-11 px-5 text-[14.5px] gap-2',
  icon: 'h-9 w-9 p-0 justify-center',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center rounded-[9px] font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
        variantClasses[variant],
        sizeClasses[size],
        block && 'w-full justify-center',
        className,
      )}
      {...props}
    />
  );
}
