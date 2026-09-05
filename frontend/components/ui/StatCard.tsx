import { Card } from './Card';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}

export function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-wide text-ink-soft uppercase">
          {label}
        </span>
        {icon && <div className="text-accent">{icon}</div>}
      </div>
      <div className="font-display text-[26px] font-extrabold text-ink">{value}</div>
    </Card>
  );
}
