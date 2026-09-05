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
        <input
          name="keyword"
          defaultValue={keyword}
          placeholder="Job title, skill or company"
          className="h-11 flex-1 rounded-[9px] border border-border px-3.5 text-[13.5px] text-ink outline-none focus:border-accent"
        />
        <input
          name="location"
          defaultValue={location}
          placeholder="Location"
          className="h-11 w-64 rounded-[9px] border border-border px-3.5 text-[13.5px] text-ink outline-none focus:border-accent"
        />
        {employmentType && <input type="hidden" name="employmentType" value={employmentType} />}
        <button
          type="submit"
          className="h-11 rounded-[9px] bg-accent px-5 text-[13.5px] font-bold text-white hover:bg-accent-hover"
        >
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
            <Link key={job.id} href={`/jobs/${job.id}`}>
              <Card className="flex items-start gap-4 transition-shadow hover:shadow-card-md">
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
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
