'use client';

import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { PaginatedResponse, PipelineTemplate } from '@/lib/types';

export default function PipelineTemplatesPage() {
  const [templates, setTemplates] = useState<PipelineTemplate[] | null>(null);
  const [name, setName] = useState('');
  const [stages, setStages] = useState(['']);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    api
      .get<PaginatedResponse<PipelineTemplate>>('/pipeline-templates', { pageSize: 50 })
      .then((res) => setTemplates(res.data));
  }

  useEffect(load, []);

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const cleaned = stages.map((s) => s.trim()).filter(Boolean);
      if (cleaned.length === 0) throw new Error('Add at least one stage.');
      await api.post('/pipeline-templates', { name, stages: cleaned });
      setName('');
      setStages(['']);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    await api.delete(`/pipeline-templates/${id}`);
    load();
  }

  return (
    <div className="mx-auto w-full max-w-[700px] px-10 py-9">
      <h1 className="mb-6 font-display text-[24px] font-extrabold text-ink">Pipeline Templates</h1>
      <p className="mb-6 text-[13px] text-ink-soft">
        Reusable stage lists you can apply to any job while setting up its pipeline.
      </p>

      <Card className="mb-6">
        <h2 className="mb-3 text-[15px] font-bold text-ink">New template</h2>
        <form onSubmit={createTemplate} className="flex flex-col gap-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" required />
          {stages.map((stage, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={stage}
                onChange={(e) => setStages(stages.map((s, idx) => (idx === i ? e.target.value : s)))}
                placeholder={`Stage ${i + 1}`}
              />
              {stages.length > 1 && (
                <button
                  type="button"
                  onClick={() => setStages(stages.filter((_, idx) => idx !== i))}
                  className="text-[13px] font-bold text-danger"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setStages([...stages, ''])}
            className="self-start text-[12px] font-bold text-accent"
          >
            + Add stage
          </button>
          {error && <p className="text-[12.5px] text-danger">{error}</p>}
          <Button type="submit" size="sm" className="self-start" disabled={creating}>
            {creating ? 'Creating…' : 'Create template'}
          </Button>
        </form>
      </Card>

      {templates === null ? null : templates.length === 0 ? (
        <EmptyState title="No templates yet" description="Create one above to reuse it across jobs." />
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map((template) => (
            <Card key={template.id} className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-bold text-ink">{template.name}</div>
                <div className="text-[12px] text-ink-faint">
                  {template.stages
                    .sort((a, b) => a.order - b.order)
                    .map((s) => s.name)
                    .join(' → ')}
                </div>
              </div>
              <button onClick={() => remove(template.id)} className="text-[11.5px] font-bold text-danger">
                Delete
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
