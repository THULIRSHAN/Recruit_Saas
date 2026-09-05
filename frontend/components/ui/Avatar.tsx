import { cn } from '@/lib/cn';

const COLORS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const colorClasses: Record<(typeof COLORS)[number], string> = {
  a: 'bg-avatar-a',
  b: 'bg-avatar-b',
  c: 'bg-avatar-c',
  d: 'bg-avatar-d',
  e: 'bg-avatar-e',
  f: 'bg-avatar-f',
};

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ name, size = 40, className }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[10px] font-bold text-white',
        colorClasses[colorFor(name)],
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initial}
    </div>
  );
}
