import { PublicTopbar } from '@/components/layout/PublicTopbar';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col bg-bg">
      <PublicTopbar />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
