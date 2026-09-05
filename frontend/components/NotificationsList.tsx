'use client';

import { useEffect, useState } from 'react';
import { Badge, BellIcon, CalendarIcon, Card, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AppNotification, PaginatedResponse } from '@/lib/types';

const TYPE_INFO: Record<string, { label: string; icon: React.ReactNode; tone: string }> = {
  'application.rejected': { label: 'Application update', icon: <BellIcon size={15} />, tone: 'bg-danger-soft text-danger' },
  'hiring.rejected': { label: 'Application update', icon: <BellIcon size={15} />, tone: 'bg-danger-soft text-danger' },
  'interview.scheduled': {
    label: 'Interview scheduled',
    icon: <CalendarIcon size={15} />,
    tone: 'bg-info-soft text-info',
  },
};

const DEFAULT_TYPE_INFO = { icon: <BellIcon size={15} />, tone: 'bg-surface-alt text-ink-soft' };

function describe(notification: AppNotification): string {
  const label = TYPE_INFO[notification.type]?.label ?? notification.type;
  const details = Object.entries(notification.payload)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
  return details ? `${label} (${details})` : label;
}

export function NotificationsList() {
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);

  function load() {
    api
      .get<PaginatedResponse<AppNotification>>('/notifications/me', { pageSize: 50 })
      .then((res) => setNotifications(res.data));
  }

  useEffect(load, []);

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    load();
  }

  if (notifications === null) {
    return <div className="text-ink-soft">Loading…</div>;
  }

  if (notifications.length === 0) {
    return <EmptyState icon={<BellIcon />} title="No notifications" description="You're all caught up." />;
  }

  return (
    <div className="flex flex-col gap-2">
      {notifications.map((n) => {
        const info = TYPE_INFO[n.type] ?? DEFAULT_TYPE_INFO;
        return (
          <Card
            key={n.id}
            className={`flex items-center gap-3 ${n.readAt ? '' : 'border-accent-soft-border bg-accent-soft'}`}
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${info.tone}`}>
              {info.icon}
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-ink">{describe(n)}</div>
              <div className="text-[11.5px] text-ink-faint">{formatDateTime(n.createdAt)}</div>
            </div>
            {!n.readAt ? (
              <button onClick={() => markRead(n.id)} className="shrink-0 text-[12px] font-bold text-accent">
                Mark read
              </button>
            ) : (
              <Badge variant="neutral">Read</Badge>
            )}
          </Card>
        );
      })}
    </div>
  );
}
