'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { OnboardingChecklist } from '@/lib/types';

interface OnboardingPanelProps {
  // Org: `/jobs/:jobId/applications/:id/onboarding`. Candidate: `/applications/:id/onboarding`.
  basePath: string;
  mode: 'org' | 'candidate';
}

export function OnboardingPanel({ basePath, mode }: OnboardingPanelProps) {
  const [checklist, setChecklist] = useState<OnboardingChecklist | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [taskNames, setTaskNames] = useState(['']);
  const [newTaskName, setNewTaskName] = useState('');
  const [creating, setCreating] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function load() {
    api
      .get<OnboardingChecklist>(basePath)
      .then(setChecklist)
      .catch(() => setChecklist(null));
  }

  useEffect(load, [basePath]);

  async function createChecklist(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const tasks = taskNames.map((n) => n.trim()).filter(Boolean).map((name) => ({ name }));
      if (tasks.length === 0) throw new Error('Add at least one task.');
      await api.post(basePath, { tasks });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function addTask() {
    if (!newTaskName.trim()) return;
    await api.post(`${basePath}/tasks`, { name: newTaskName.trim() });
    setNewTaskName('');
    load();
  }

  async function completeTask(taskId: string) {
    await api.patch(`${basePath}/tasks/${taskId}/complete`);
    load();
  }

  async function uploadDocument(taskId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    await api.postForm(`${basePath}/tasks/${taskId}/documents`, form);
    load();
  }

  if (checklist === undefined) {
    return <div className="text-ink-soft">Loading…</div>;
  }

  if (checklist === null) {
    if (mode === 'candidate') return null;
    return (
      <Card>
        <h2 className="mb-3 text-[15px] font-bold text-ink">Onboarding</h2>
        <form onSubmit={createChecklist} className="flex flex-col gap-2">
          {taskNames.map((name, i) => (
            <Input
              key={i}
              value={name}
              onChange={(e) => setTaskNames(taskNames.map((t, idx) => (idx === i ? e.target.value : t)))}
              placeholder={`Task ${i + 1} (e.g. Submit ID proof)`}
            />
          ))}
          <button
            type="button"
            onClick={() => setTaskNames([...taskNames, ''])}
            className="self-start text-[12px] font-bold text-accent"
          >
            + Add task
          </button>
          {error && <p className="text-[12.5px] text-danger">{error}</p>}
          <Button type="submit" size="sm" className="self-start" disabled={creating}>
            {creating ? 'Starting…' : 'Start onboarding'}
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-3 text-[15px] font-bold text-ink">Onboarding</h2>
      <div className="flex flex-col gap-2">
        {checklist.tasks.map((task) => (
          <div key={task.id} className="rounded-[9px] border border-border p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink">{task.name}</span>
              {task.completedAt ? (
                <Badge variant="success">Complete</Badge>
              ) : mode === 'org' ? (
                <button onClick={() => completeTask(task.id)} className="text-[11.5px] font-bold text-accent">
                  Mark complete
                </button>
              ) : (
                <Badge variant="warning">Pending</Badge>
              )}
            </div>
            {task.documents.map((doc) => (
              <div key={doc.id} className="text-[11.5px] text-ink-faint">
                {doc.fileName} · uploaded {formatDate(doc.uploadedAt)}
              </div>
            ))}
            {mode === 'candidate' && !task.completedAt && (
              <>
                <input
                  ref={(el) => {
                    fileInputRefs.current[task.id] = el;
                  }}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadDocument(task.id, file);
                  }}
                />
                <button
                  onClick={() => fileInputRefs.current[task.id]?.click()}
                  className="mt-1 text-[11.5px] font-bold text-accent"
                >
                  Upload document
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      {mode === 'org' && (
        <div className="mt-3 flex gap-2">
          <Input
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
            placeholder="Request another document"
          />
          <Button size="sm" variant="secondary" onClick={addTask}>
            Add
          </Button>
        </div>
      )}
    </Card>
  );
}
