'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { Job, PaginatedResponse, PipelineTemplate, RecruitmentStage } from '@/lib/types';

export default function EditJobPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    department: '',
    location: '',
    employmentType: '',
    salaryMin: '',
    salaryMax: '',
  });
  const [savingJob, setSavingJob] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);

  const [stages, setStages] = useState<string[]>([]);
  const [templates, setTemplates] = useState<PipelineTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [stagesError, setStagesError] = useState<string | null>(null);
  const [savingStages, setSavingStages] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  function load() {
    api.get<Job>(`/jobs/${id}`).then((j) => {
      setJob(j);
      setForm({
        title: j.title,
        description: j.description,
        department: j.department ?? '',
        location: j.location ?? '',
        employmentType: j.employmentType ?? '',
        salaryMin: j.salaryMin?.toString() ?? '',
        salaryMax: j.salaryMax?.toString() ?? '',
      });
    });
    api.get<RecruitmentStage[]>(`/jobs/${id}/stages`).then((s) => setStages(s.map((x) => x.name)));
    api
      .get<PaginatedResponse<PipelineTemplate>>('/pipeline-templates', { pageSize: 50 })
      .then((res) => setTemplates(res.data));
  }

  useEffect(load, [id]);

  async function saveJob(e: React.FormEvent) {
    e.preventDefault();
    setSavingJob(true);
    setJobError(null);
    try {
      const updated = await api.patch<Job>(`/jobs/${id}`, {
        title: form.title,
        description: form.description,
        department: form.department || undefined,
        location: form.location || undefined,
        employmentType: form.employmentType || undefined,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : undefined,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : undefined,
      });
      setJob(updated);
    } catch (err) {
      setJobError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSavingJob(false);
    }
  }

  async function applyTemplate() {
    if (!selectedTemplate) return;
    const template = templates.find((t) => t.id === selectedTemplate);
    if (template) setStages(template.stages.sort((a, b) => a.order - b.order).map((s) => s.name));
  }

  async function saveStages() {
    setSavingStages(true);
    setStagesError(null);
    try {
      const cleaned = stages.map((s) => s.trim()).filter(Boolean);
      if (cleaned.length === 0) throw new Error('Add at least one stage.');
      await api.patch(`/jobs/${id}/stages`, { stages: cleaned });
      setStages(cleaned);
    } catch (err) {
      setStagesError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setSavingStages(false);
    }
  }

  async function publish() {
    setLifecycleError(null);
    try {
      const updated = await api.post<Job>(`/jobs/${id}/publish`);
      setJob(updated);
    } catch (err) {
      setLifecycleError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  async function close() {
    setLifecycleError(null);
    try {
      const updated = await api.post<Job>(`/jobs/${id}/close`);
      setJob(updated);
    } catch (err) {
      setLifecycleError(err instanceof ApiError ? err.message : 'Something went wrong.');
    }
  }

  if (!job) {
    return <div className="px-10 py-9 text-ink-soft">Loading…</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[700px] px-10 py-9">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-[22px] font-extrabold text-ink">{job.title}</h1>
          <Badge variant={job.status === 'PUBLISHED' ? 'success' : 'neutral'}>{job.status}</Badge>
        </div>
        <div className="flex gap-2">
          {job.status === 'DRAFT' && <Button onClick={publish}>Publish</Button>}
          {job.status === 'PUBLISHED' && (
            <Button variant="secondary" onClick={close}>
              Close job
            </Button>
          )}
          <Link href={`/org/jobs/${job.id}/pipeline`}>
            <Button variant="secondary">View pipeline</Button>
          </Link>
        </div>
      </div>
      {lifecycleError && <p className="mb-4 text-[12.5px] text-danger">{lifecycleError}</p>}

      <Card className="mb-4">
        <h2 className="mb-3 text-[15px] font-bold text-ink">Job details</h2>
        <form onSubmit={saveJob} className="flex flex-col gap-4">
          <Field label="Job title">
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Department">
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </Field>
            <Field label="Location">
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Employment type">
              <Select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
                <option value="">—</option>
                <option>Full-time</option>
                <option>Part-time</option>
                <option>Contract</option>
                <option>Internship</option>
              </Select>
            </Field>
            <Field label="Salary min">
              <Input type="number" value={form.salaryMin} onChange={(e) => setForm({ ...form, salaryMin: e.target.value })} />
            </Field>
            <Field label="Salary max">
              <Input type="number" value={form.salaryMax} onChange={(e) => setForm({ ...form, salaryMax: e.target.value })} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea required rows={8} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          {jobError && <p className="text-[12.5px] text-danger">{jobError}</p>}
          <Button type="submit" size="sm" disabled={savingJob} className="self-start">
            {savingJob ? 'Saving…' : 'Save Draft'}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 text-[15px] font-bold text-ink">Recruitment pipeline</h2>
        <p className="mb-3 text-[12.5px] text-ink-soft">
          At least one stage is required before you can publish this job.
        </p>
        {templates.length > 0 && (
          <div className="mb-4 flex gap-2">
            <Select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}>
              <option value="">Choose a template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Button type="button" variant="secondary" onClick={applyTemplate}>
              Load Template
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {stages.map((stage, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={stage}
                onChange={(e) => setStages(stages.map((s, idx) => (idx === i ? e.target.value : s)))}
              />
              <button
                onClick={() => setStages(stages.filter((_, idx) => idx !== i))}
                className="text-[13px] font-bold text-danger"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStages([...stages, ''])}
            className="text-[12.5px] font-bold text-accent"
          >
            + Add Stage
          </button>
          <Button size="sm" onClick={saveStages} disabled={savingStages}>
            {savingStages ? 'Saving…' : 'Save pipeline'}
          </Button>
        </div>
        {stagesError && <p className="mt-3 text-[12.5px] text-danger">{stagesError}</p>}
      </Card>
    </div>
  );
}
