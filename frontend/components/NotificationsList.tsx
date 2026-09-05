'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AppNotification, PaginatedResponse } from '@/lib/types';

const TYPE_LABEL: Record<string, string> = {
  'application.rejected': 'Application update',
  'hiring.rejected': 'Application update',
  'interview.scheduled': 'Interview scheduled',
};

function describe(notification: AppNotification): string {
  const label = TYPE_LABEL[notification.type] ?? notification.type;
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
    return <EmptyState title="No notifications" description="You're all caught up." />;
  }

  return (
    <div className="flex flex-col gap-2">
      {notifications.map((n) => (
        <Card
          key={n.id}
          className={`flex items-center justify-between gap-4 ${n.readAt ? 'opacity-60' : ''}`}
        >
          <div>
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
      ))}
    </div>
  );
}
