import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar, Badge, Button, Card, Divider } from '@/components/ui';
import { getPublicJob } from '@/lib/public-jobs';
import { formatRelativeDate, formatSalaryRange } from '@/lib/format';

interface JobPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: JobPageProps): Promise<Metadata> {
  const { id } = await params;
  const job = await getPublicJob(id);
  if (!job) return { title: 'Job not found' };
  return { title: `${job.title} at ${job.organization.name}` };
}

export default async function JobPage({ params }: JobPageProps) {
  const { id } = await params;
  const job = await getPublicJob(id);
  if (!job) notFound();

  const salary = formatSalaryRange(job.salaryMin, job.salaryMax);

  return (
    <div className="mx-auto flex w-full max-w-[1280px] gap-11 px-10 py-9">
      <div className="max-w-[720px] flex-[1.7]">
        <Link href="/" className="mb-4.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft">
          ← Back to search
        </Link>
        <div className="mb-3.5 flex items-center gap-3">
          <Avatar name={job.organization.name} size={40} />
          <div className="text-[13px] font-bold text-ink-soft">{job.organization.name}</div>
        </div>
        <h1 className="font-display text-[29px] font-extrabold text-ink">{job.title}</h1>
        <div className="my-3.5 flex flex-wrap items-center gap-4 text-[13px] text-ink-soft">
          {job.location && <span>{job.location}</span>}
          {job.employmentType && <span>{job.employmentType}</span>}
          {salary && <span>{salary}</span>}
          <span>{formatRelativeDate(job.publishedAt)}</span>
          <Badge variant="success">Actively hiring</Badge>
        </div>
        <Divider className="my-4" />
        <h2 className="mb-2.5 text-[17px] font-bold text-ink">About the role</h2>
        <p className="whitespace-pre-line text-[13.5px] leading-[1.7] text-ink-soft">
          {job.description}
        </p>
      </div>

      <div className="flex max-w-[300px] flex-1 flex-col gap-4">
        <Card className="flex flex-col gap-3.5">
          <Link href={`/apply?job=${job.id}`}>
            <Button variant="primary" size="lg" block>
              Apply now
            </Button>
          </Link>
          <Button variant="secondary" block>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.5l2.5 5.6 6 .6-4.5 4.1 1.3 6-5.3-3.1-5.3 3.1 1.3-6-4.5-4.1 6-.6Z" />
            </svg>
            Save job
          </Button>
          <Divider />
          <div className="text-[13px] text-ink-soft">Posted at {job.organization.name}</div>
        </Card>
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <Avatar name={job.organization.name} size={36} />
            <div className="text-[13.5px] font-bold text-ink">{job.organization.name}</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
