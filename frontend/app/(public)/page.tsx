import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card } from '@/components/ui';
import { Avatar } from '@/components/ui/Avatar';
import { searchPublicJobs } from '@/lib/public-jobs';
import { formatRelativeDate, formatSalaryRange } from '@/lib/format';
import { EMPLOYMENT_TYPES } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Find your next role',
};

interface HomePageProps {
  searchParams: Promise<{ keyword?: string; location?: string; employmentType?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { keyword = '', location = '', employmentType = '' } = await searchParams;
  const { data: jobs, meta } = await searchPublicJobs({ keyword, location, employmentType });

  function pillHref(type: string) {
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (location) params.set('location', location);
    if (type) params.set('employmentType', type);
    const qs = params.toString();
    return qs ? `/?${qs}` : '/';
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-10 pb-16">
      <div className="py-11">
        <h1 className="font-display text-[34px] font-extrabold text-ink">
          Find your next role
        </h1>
        <p className="mt-2 text-[15px] text-ink-soft">
          {meta.total} open role{meta.total === 1 ? '' : 's'} on Hirelane right now
        </p>
      </div>

      <form method="get" className="mb-6 flex gap-2.5 rounded-lg border border-border bg-surface p-4 shadow-card-sm">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-[9px] border border-border px-3.5 focus-within:border-accent">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="10" cy="10" r="6.5" />
            <line x1="15" y1="15" x2="20" y2="20" />
          </svg>
          <input
            name="keyword"
            defaultValue={keyword}
            placeholder="Job title, skill or company"
            className="h-full w-full text-[13.5px] text-ink outline-none"
          />
        </div>
        <div className="flex h-11 w-64 items-center gap-2 rounded-[9px] border border-border px-3.5 focus-within:border-accent">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M12 21s-6.5-6-6.5-11.2A6.5 6.5 0 0 1 18.5 9.8C18.5 15 12 21 12 21Z" />
            <circle cx="12" cy="9.8" r="2.3" />
          </svg>
          <input
            name="location"
            defaultValue={location}
            placeholder="Location"
            className="h-full w-full text-[13.5px] text-ink outline-none"
          />
        </div>
        {employmentType && <input type="hidden" name="employmentType" value={employmentType} />}
        <button
          type="submit"
          className="flex h-11 items-center gap-1.5 rounded-[9px] bg-accent px-5 text-[13.5px] font-bold text-white hover:bg-accent-hover"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10" cy="10" r="6.5" />
            <line x1="15" y1="15" x2="20" y2="20" />
          </svg>
          Search
        </button>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href={pillHref('')}
          className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold ${
            !employmentType
              ? 'border-accent bg-accent text-white'
              : 'border-border bg-surface text-ink-soft'
          }`}
        >
          All roles
        </Link>
        {EMPLOYMENT_TYPES.map((type) => (
          <Link
            key={type}
            href={pillHref(type)}
            className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold ${
              employmentType === type
                ? 'border-accent bg-accent text-white'
                : 'border-border bg-surface text-ink-soft'
            }`}
          >
            {type}
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-3 pb-16">
        {jobs.length === 0 && (
          <Card className="text-center text-[13.5px] text-ink-soft">
            No open roles match your search right now.
          </Card>
        )}
        {jobs.map((job) => {
          const salary = formatSalaryRange(job.salaryMin, job.salaryMax);
          return (
            <Card key={job.id} className="flex items-start gap-4 transition-shadow hover:shadow-card-md">
              <Link href={`/jobs/${job.id}`} className="flex flex-1 items-start gap-4 min-w-0">
                <Avatar name={job.organization.name} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[14.5px] font-bold text-accent">{job.title}</div>
                    {salary && <Badge variant="neutral">{salary}</Badge>}
                  </div>
                  <div className="mt-1 text-[13px] text-ink-soft">
                    {job.organization.name}
                    {job.location && ` · ${job.location}`}
                    {job.employmentType && ` · ${job.employmentType}`}
                  </div>
                  <div className="mt-2 text-[12.5px] text-ink-faint">
                    {formatRelativeDate(job.publishedAt)}
                  </div>
                </div>
              </Link>
              <button type="button" aria-label="Save job" className="shrink-0 text-ink-faint hover:text-warning">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3.5l2.5 5.6 6 .6-4.5 4.1 1.3 6-5.3-3.1-5.3 3.1 1.3-6-4.5-4.1 6-.6Z" />
                </svg>
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
