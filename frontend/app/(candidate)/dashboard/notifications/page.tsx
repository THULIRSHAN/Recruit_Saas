import { NotificationsList } from '@/components/NotificationsList';

export default function CandidateNotificationsPage() {
  return (
    <div className="mx-auto w-full max-w-[700px] px-10 py-9">
      <h1 className="mb-6 font-display text-[24px] font-extrabold text-ink">Notifications</h1>
      <NotificationsList />
    </div>
  );
}
