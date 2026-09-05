'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type {
  CandidateEducation,
  CandidateExperience,
  CandidateProfile,
  CandidateSkill,
} from '@/lib/types';

export default function CandidateProfilePage() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [headline, setHeadline] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [savingAbout, setSavingAbout] = useState(false);

  const [newSkill, setNewSkill] = useState('');

  function load() {
    api.get<CandidateProfile>('/candidates/me').then((p) => {
      setProfile(p);
      setHeadline(p.headline ?? '');
      setLocation(p.location ?? '');
      setPhone(p.phone ?? '');
    });
  }

  useEffect(load, []);

  async function saveAbout(e: React.FormEvent) {
    e.preventDefault();
    setSavingAbout(true);
    setError(null);
    try {
      const updated = await api.patch<CandidateProfile>('/candidates/me', {
        headline,
        location,
        phone,
      });
      setProfile(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setSavingAbout(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      await api.postForm('/candidates/me/cvs', form);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function setPrimary(id: string) {
    await api.patch(`/candidates/me/cvs/${id}/primary`);
    load();
  }

  async function deleteCv(id: string) {
    await api.delete(`/candidates/me/cvs/${id}`);
    load();
  }

  async function updateEducation(items: CandidateEducation[]) {
    // These endpoints return just the replaced list, not the whole profile
    // (see CandidatesService.replaceEducation) -- merge it in rather than
    // overwrite `profile` with a partial shape.
    const education = await api.patch<CandidateEducation[]>('/candidates/me/education', {
      education: items.map(({ institution, degree, startYear, endYear }) => ({
        institution,
        degree,
        startYear,
        endYear,
      })),
    });
    setProfile((prev) => (prev ? { ...prev, education } : prev));
  }

  async function updateExperience(items: CandidateExperience[]) {
    // @IsOptional() only skips validation for null/undefined, not '' -- an
    // empty string still hits @IsDateString() and fails with "must be a
    // valid ISO 8601 date string", so blank date inputs must become
    // undefined here, not sent as ''.
    const experience = await api.patch<CandidateExperience[]>('/candidates/me/experience', {
      experience: items.map(({ company, title, startDate, endDate, description }) => ({
        company,
        title,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        description,
      })),
    });
    setProfile((prev) => (prev ? { ...prev, experience } : prev));
  }

  async function updateSkills(items: CandidateSkill[]) {
    const skills = await api.patch<CandidateSkill[]>('/candidates/me/skills', {
      skills: items.map((s) => s.name),
    });
    setProfile((prev) => (prev ? { ...prev, skills } : prev));
  }

  if (!profile) {
    return <div className="px-10 py-9 text-ink-soft">Loading…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[900px] gap-8 px-10 py-9">
      <div className="w-[280px] shrink-0">
        <Card className="mb-4">
          <h2 className="mb-1 text-[16px] font-bold text-ink">About</h2>
          <form onSubmit={saveAbout} className="mt-3 flex flex-col gap-3">
            <Field label="Headline">
              <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Senior Product Designer" />
            </Field>
            <Field label="Location">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote (US)" />
            </Field>
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
            </Field>
            <Button type="submit" size="sm" disabled={savingAbout}>
              {savingAbout ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </Card>
      </div>

      <div className="flex-1">
        {error && <p className="mb-4 text-[12.5px] text-danger">{error}</p>}

        <Card className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-ink">Resume / CV</h2>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={handleUpload}
            />
            <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload new CV'}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {profile.cvs.length === 0 && <p className="text-[13px] text-ink-faint">No CVs uploaded yet.</p>}
            {profile.cvs.map((cv) => (
              <div key={cv.id} className="flex items-center justify-between rounded-[9px] border border-border px-3 py-2.5">
                <div>
                  <div className="text-[13px] font-semibold text-ink">{cv.fileName}</div>
                  <div className="text-[11.5px] text-ink-faint">Uploaded {formatDate(cv.uploadedAt)}</div>
                </div>
                <div className="flex items-center gap-2">
                  {cv.isPrimary ? (
                    <Badge variant="accent">Primary</Badge>
                  ) : (
                    <button onClick={() => setPrimary(cv.id)} className="text-[11.5px] font-bold text-accent">
                      Make primary
                    </button>
                  )}
                  <button onClick={() => deleteCv(cv.id)} className="text-[11.5px] font-bold text-danger">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <ExperienceEditor items={profile.experience} onSave={updateExperience} />
        <EducationEditor items={profile.education} onSave={updateEducation} />
        <SkillsEditor items={profile.skills} onSave={updateSkills} newSkill={newSkill} setNewSkill={setNewSkill} />
      </div>
    </div>
  );
}

function ExperienceEditor({
  items,
  onSave,
}: {
  items: CandidateExperience[];
  onSave: (items: CandidateExperience[]) => Promise<void>;
}) {
  // Seeded once from the parent's loaded profile; this editor owns the
  // list from then on (an explicit "Save changes" writes it back) rather
  // than re-syncing on every parent re-render, which would clobber
  // in-progress edits.
  const [rows, setRows] = useState(items);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function updateRow(id: string, patch: Partial<CandidateExperience>) {
    setDirty(true);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setDirty(true);
    setRows((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, company: '', title: '', startDate: '', endDate: null, description: '' },
    ]);
  }
  function removeRow(id: string) {
    setDirty(true);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const incomplete = rows.some((r) => !r.company.trim() || !r.title.trim());
      if (incomplete) {
        throw new Error('Company and title are required for every entry.');
      }
      await onSave(rows);
      setDirty(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-ink">Experience</h2>
        <Button size="sm" variant="secondary" onClick={addRow}>
          Add
        </Button>
      </div>
      {rows.length === 0 && <p className="text-[13px] text-ink-faint">No experience added yet.</p>}
      <div className="flex flex-col gap-3">
        {rows.map((item) => (
          <div key={item.id} className="flex flex-col gap-2 rounded-[9px] border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="grid flex-1 grid-cols-2 gap-2">
                <Input
                  value={item.title}
                  onChange={(e) => updateRow(item.id, { title: e.target.value })}
                  placeholder="Title"
                />
                <Input
                  value={item.company}
                  onChange={(e) => updateRow(item.id, { company: e.target.value })}
                  placeholder="Company"
                />
              </div>
              <button onClick={() => removeRow(item.id)} className="text-[11.5px] font-bold text-danger">
                Remove
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={toDateInputValue(item.startDate)}
                onChange={(e) => updateRow(item.id, { startDate: e.target.value })}
              />
              <Input
                type="date"
                value={toDateInputValue(item.endDate)}
                onChange={(e) => updateRow(item.id, { endDate: e.target.value || null })}
              />
            </div>
            <textarea
              value={item.description ?? ''}
              onChange={(e) => updateRow(item.id, { description: e.target.value })}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-[9px] border border-border p-2 text-[12.5px] outline-none focus:border-accent"
            />
          </div>
        ))}
      </div>
      {error && <p className="mt-3 text-[12.5px] text-danger">{error}</p>}
      {dirty && (
        <Button size="sm" className="mt-3" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      )}
    </Card>
  );
}

// <input type="date"> needs "YYYY-MM-DD"; the API returns full ISO
// datetimes -- truncate rather than reparsing through Date (avoids
// timezone shifting the displayed day).
function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

function EducationEditor({
  items,
  onSave,
}: {
  items: CandidateEducation[];
  onSave: (items: CandidateEducation[]) => Promise<void>;
}) {
  const [rows, setRows] = useState(items);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function updateRow(id: string, patch: Partial<CandidateEducation>) {
    setDirty(true);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setDirty(true);
    setRows((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, institution: '', degree: '', startYear: null, endYear: null },
    ]);
  }
  function removeRow(id: string) {
    setDirty(true);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const incomplete = rows.some((r) => !r.institution.trim());
      if (incomplete) {
        throw new Error('Institution is required for every entry.');
      }
      await onSave(rows);
      setDirty(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-ink">Education</h2>
        <Button size="sm" variant="secondary" onClick={addRow}>
          Add
        </Button>
      </div>
      {rows.length === 0 && <p className="text-[13px] text-ink-faint">No education added yet.</p>}
      <div className="flex flex-col gap-3">
        {rows.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-3 rounded-[9px] border border-border p-3">
            <div className="grid flex-1 grid-cols-2 gap-2">
              <Input
                value={item.institution}
                onChange={(e) => updateRow(item.id, { institution: e.target.value })}
                placeholder="Institution"
              />
              <Input
                value={item.degree ?? ''}
                onChange={(e) => updateRow(item.id, { degree: e.target.value })}
                placeholder="Degree"
              />
              <Input
                type="number"
                value={item.startYear ?? ''}
                onChange={(e) => updateRow(item.id, { startYear: e.target.value ? Number(e.target.value) : null })}
                placeholder="Start year"
              />
              <Input
                type="number"
                value={item.endYear ?? ''}
                onChange={(e) => updateRow(item.id, { endYear: e.target.value ? Number(e.target.value) : null })}
                placeholder="End year"
              />
            </div>
            <button onClick={() => removeRow(item.id)} className="text-[11.5px] font-bold text-danger">
              Remove
            </button>
          </div>
        ))}
      </div>
      {error && <p className="mt-3 text-[12.5px] text-danger">{error}</p>}
      {dirty && (
        <Button size="sm" className="mt-3" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      )}
    </Card>
  );
}

function SkillsEditor({
  items,
  onSave,
  newSkill,
  setNewSkill,
}: {
  items: CandidateSkill[];
  onSave: (items: CandidateSkill[]) => Promise<void>;
  newSkill: string;
  setNewSkill: (v: string) => void;
}) {
  function addSkill() {
    const trimmed = newSkill.trim();
    if (!trimmed) return;
    onSave([...items, { id: `new-${Date.now()}`, name: trimmed }]).catch(() => {});
    setNewSkill('');
  }
  function removeSkill(id: string) {
    onSave(items.filter((i) => i.id !== id)).catch(() => {});
  }

  return (
    <Card>
      <h2 className="mb-3 text-[15px] font-bold text-ink">Skills</h2>
      <div className="flex flex-wrap gap-2">
        {items.map((skill) => (
          <span
            key={skill.id}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface-alt px-3 py-1.5 text-[12.5px] font-semibold text-ink"
          >
            {skill.name}
            <button onClick={() => removeSkill(skill.id)} className="text-ink-faint hover:text-danger">
              ×
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1.5">
          <input
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
            placeholder="Add skill"
            className="w-28 rounded-full border border-dashed border-border px-3 py-1.5 text-[12.5px] outline-none focus:border-accent"
          />
        </div>
      </div>
    </Card>
  );
}
