import { Card } from './Card';

type StatTone = 'accent' | 'success' | 'warning' | 'danger' | 'info';

const TONE_CLASSES: Record<StatTone, string> = {
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  tone?: StatTone;
}

export function StatCard({ label, value, icon, tone = 'accent' }: StatCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-wide text-ink-soft uppercase">
          {label}
        </span>
        {icon && (
          <div className={`flex h-7 w-7 items-center justify-center rounded-full ${TONE_CLASSES[tone]}`}>
            {icon}
          </div>
        )}
      </div>
      <div className="font-display text-[26px] font-extrabold text-ink">{value}</div>
    </Card>
  );
}
