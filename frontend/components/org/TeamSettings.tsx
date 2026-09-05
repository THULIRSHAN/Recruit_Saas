'use client';

import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card, ConfirmDialog, Field, Input, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { OrgMember, PendingInvitation } from '@/lib/types';

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

type PendingAction =
  | { type: 'remove-member'; id: string; label: string }
  | { type: 'cancel-invitation'; id: string; label: string };

export function TeamSettings() {
  const { user } = useAuth();
  const isOwner = user?.roles.includes('COMPANY_OWNER') ?? false;

  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [invitations, setInvitations] = useState<PendingInvitation[] | null>(null);
  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState('RECRUITER');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<InvitationSent | null>(null);
  const [inviting, setInviting] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function loadMembers() {
    api.get<OrgMember[]>('/organizations/me/members').then(setMembers);
  }
  function loadInvitations() {
    if (!isOwner) return;
    api.get<PendingInvitation[]>('/organizations/me/invitations').then(setInvitations);
  }

  useEffect(loadMembers, []);
  useEffect(loadInvitations, [isOwner]);

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
      loadInvitations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setInviting(false);
    }
  }

  async function confirmAction() {
    if (!pendingAction) return;
    setActing(true);
    setActionError(null);
    try {
      if (pendingAction.type === 'remove-member') {
        await api.delete(`/organizations/me/members/${pendingAction.id}`);
        loadMembers();
      } else {
        await api.delete(`/organizations/me/invitations/${pendingAction.id}`);
        loadInvitations();
      }
      setPendingAction(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setActing(false);
    }
  }

  return (
    <>
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

      <h2 className="mb-3 text-[15px] font-bold text-ink">Team members</h2>
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
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  {member.roles.map((role) => (
                    <Badge key={role} variant="neutral">
                      {role.replace('_', ' ')}
                    </Badge>
                  ))}
                </div>
                <Badge variant="success">Active</Badge>
                {isOwner && member.id !== user?.sub && (
                  <button
                    onClick={() =>
                      setPendingAction({ type: 'remove-member', id: member.id, label: member.fullName })
                    }
                    className="text-[12px] font-bold text-danger"
                  >
                    Remove
                  </button>
                )}
              </div>
            </Card>
          ))}

          {invitations?.map((invitation) => (
            <Card key={invitation.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={invitation.email} size={34} />
                <div>
                  <div className="text-[13px] font-bold text-ink">{invitation.email}</div>
                  <div className="text-[12px] text-ink-faint">Invited as {invitation.role?.name ?? 'Unknown role'}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="warning">Invited</Badge>
                <button
                  onClick={() =>
                    setPendingAction({ type: 'cancel-invitation', id: invitation.id, label: invitation.email })
                  }
                  className="text-[12px] font-bold text-danger"
                >
                  Cancel
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction?.type === 'remove-member' ? 'Remove teammate?' : 'Cancel invitation?'}
        description={
          pendingAction?.type === 'remove-member'
            ? `${pendingAction.label} will lose access to this organization immediately.`
            : `The invitation sent to ${pendingAction?.label} will no longer be valid.`
        }
        confirmLabel={pendingAction?.type === 'remove-member' ? 'Remove' : 'Cancel invitation'}
        cancelLabel="Keep"
        variant="danger"
        confirming={acting}
        onConfirm={confirmAction}
        onCancel={() => {
          setPendingAction(null);
          setActionError(null);
        }}
      />
      {actionError && <p className="mt-3 text-[12.5px] text-danger">{actionError}</p>}
    </>
  );
}
