import { TeamSettings } from '@/components/org/TeamSettings';

export default function TeamPage() {
  return (
    <div className="mx-auto w-full max-w-[700px] px-10 py-9">
      <h1 className="mb-6 font-display text-[24px] font-extrabold text-ink">Team</h1>
      <TeamSettings />
    </div>
  );
}
