'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Avatar, Card } from '@/components/ui';
import { api } from '@/lib/api';
import type { Job, OrgApplication, PaginatedResponse, RecruitmentStage } from '@/lib/types';

export default function PipelinePage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [stages, setStages] = useState<RecruitmentStage[]>([]);
  const [applications, setApplications] = useState<OrgApplication[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get<Job>(`/jobs/${id}`).then(setJob);
    api.get<RecruitmentStage[]>(`/jobs/${id}/stages`).then((s) => setStages(s.sort((a, b) => a.order - b.order)));
    api
      .get<PaginatedResponse<OrgApplication>>(`/jobs/${id}/applications`, { pageSize: 200 })
      .then((res) => setApplications(res.data));
  }, [id]);

  const filtered = useMemo(
    () =>
      applications.filter((a) =>
        a.candidate.fullName.toLowerCase().includes(search.toLowerCase()),
      ),
    [applications, search],
  );

  const columns = useMemo(() => {
    return stages.map((stage) => ({
      stage,
      applications: filtered.filter(
        (a) => a.status === 'ACTIVE' && a.stage.id === stage.id,
      ),
    }));
  }, [stages, filtered]);

  return (
    <div className="flex h-full flex-col px-8 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-[20px] font-extrabold text-ink">
            {job?.title ?? 'Pipeline'}
          </h1>
          <p className="text-[12.5px] text-ink-soft">Candidate pipeline</p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search candidates…"
          className="h-9 w-64 rounded-[9px] border border-border px-3 text-[13px] outline-none focus:border-accent"
        />
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
        {columns.map(({ stage, applications: apps }) => (
          <div key={stage.id} className="flex w-[260px] shrink-0 flex-col rounded-lg bg-surface-alt p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-[12.5px] font-bold text-ink">{stage.name}</span>
              <span className="text-[11.5px] font-bold text-ink-faint">{apps.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {apps.map((app) => (
                <Link key={app.id} href={`/org/jobs/${id}/applications/${app.id}`}>
                  <Card className="flex items-center gap-2.5 p-3 hover:shadow-card-md">
                    <Avatar name={app.candidate.fullName} size={30} />
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-bold text-ink">
                        {app.candidate.fullName}
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
