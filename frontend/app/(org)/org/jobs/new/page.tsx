'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { Job } from '@/lib/types';

export default function NewJobPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [employmentType, setEmploymentType] = useState('Full-time');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const job = await api.post<Job>('/jobs', {
        title,
        description,
        department: department || undefined,
        location: location || undefined,
        employmentType: employmentType || undefined,
        salaryMin: salaryMin ? Number(salaryMin) : undefined,
        salaryMax: salaryMax ? Number(salaryMax) : undefined,
      });
      router.push(`/org/jobs/${job.id}/edit`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[700px] px-10 py-9">
      <h1 className="mb-6 font-display text-[24px] font-extrabold text-ink">Post a Job</h1>
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Job title">
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Senior Product Designer" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Department">
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Design" />
            </Field>
            <Field label="Location">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote (US)" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Employment type">
              <Select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                <option>Full-time</option>
                <option>Part-time</option>
                <option>Contract</option>
                <option>Internship</option>
              </Select>
            </Field>
            <Field label="Salary min">
              <Input type="number" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} placeholder="130000" />
            </Field>
            <Field label="Salary max">
              <Input type="number" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} placeholder="165000" />
            </Field>
          </div>
          <Field label="Description">
            <Textarea required rows={8} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="About the role, responsibilities, requirements…" />
          </Field>
          {error && <p className="text-[12.5px] text-danger">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Continue to pipeline setup'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
