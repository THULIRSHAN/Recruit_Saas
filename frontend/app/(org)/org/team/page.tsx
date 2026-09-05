'use client';

import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card, Field, Input, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { OrgMember } from '@/lib/types';

const INVITABLE_ROLES = [
  { key: 'COMPANY_OWNER', label: 'Company Owner' },
  { key: 'RECRUITER', label: 'Recruiter' },
  { key: 'HIRING_MANAGER', label: 'Hiring Manager' },
  { key: 'INTERVIEWER', label: 'Interviewer' },
  { key: 'HR_MANAGER', label: 'HR Manager' },
];

interface InvitationSent {
  email: string;
  role: { key: string; name: string };
  expiresAt: string;
}

export default function TeamPage() {
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState('RECRUITER');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<InvitationSent | null>(null);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    api.get<OrgMember[]>('/organizations/me/members').then(setMembers);
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    setSent(null);
    try {
      const invitation = await api.post<InvitationSent>('/organizations/me/invitations', {
        email,
        roleKey,
      });
      setSent(invitation);
      setEmail('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[700px] px-10 py-9">
      <h1 className="mb-6 font-display text-[24px] font-extrabold text-ink">Team</h1>

      <Card className="mb-6">
        <h2 className="mb-3 text-[15px] font-bold text-ink">Invite a teammate</h2>
        <form onSubmit={invite} className="flex items-end gap-2">
          <Field label="Email" className="flex-1">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
            />
          </Field>
          <Field label="Role">
            <Select value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
              {INVITABLE_ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={inviting}>
            {inviting ? 'Sending…' : 'Send invite'}
          </Button>
        </form>
        {error && <p className="mt-3 text-[12.5px] text-danger">{error}</p>}
        {sent && (
          <p className="mt-3 text-[12.5px] text-success">
            Invitation sent to {sent.email} as {sent.role.name}. They have until the invite expires
            to accept it from the link they were sent.
          </p>
        )}
      </Card>

      <h2 className="mb-3 text-[15px] font-bold text-ink">Current members</h2>
      {members === null ? null : (
        <div className="flex flex-col gap-2">
          {members.map((member) => (
            <Card key={member.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={member.fullName} size={34} />
                <div>
                  <div className="text-[13px] font-bold text-ink">{member.fullName}</div>
                  <div className="text-[12px] text-ink-faint">{member.email}</div>
                </div>
              </div>
              <div className="flex gap-1.5">
                {member.roles.map((role) => (
                  <Badge key={role} variant="neutral">
                    {role.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
