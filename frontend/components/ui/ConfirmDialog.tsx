'use client';

import { Button } from './Button';
import { Card } from './Card';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'neutral';
  confirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_STYLES = {
  danger: { circle: 'bg-danger-soft text-danger', button: 'danger' as const },
  warning: { circle: 'bg-warning-soft text-warning', button: 'primary' as const },
  neutral: { circle: 'bg-surface-alt text-ink-soft', button: 'primary' as const },
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  confirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  const styles = VARIANT_STYLES[variant];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <Card
        className="w-full max-w-[360px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${styles.circle}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
            <line x1="12" y1="10" x2="12" y2="14.5" />
            <line x1="12" y1="17.2" x2="12" y2="17.2" />
          </svg>
        </div>
        <h3 className="mb-1.5 text-[15px] font-bold text-ink">{title}</h3>
        {description && <p className="mb-5 text-[13px] text-ink-soft">{description}</p>}
        <div className="flex justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={confirming}>
            {cancelLabel}
          </Button>
          <Button variant={styles.button} size="sm" onClick={onConfirm} disabled={confirming}>
            {confirming ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
