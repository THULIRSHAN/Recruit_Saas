# Authorization Architecture (RBAC)

Status: DRAFT v1.0

## 1. What & Why

Authorization answers "now that we know who you are, are you allowed to do *this specific thing*?" The brief is explicit that this must **not** be scattered `if (user.role === 'RECRUITER')` checks sprinkled through controllers — that pattern is exactly how student (and plenty of professional) projects end up with security holes, because every new endpoint has to remember to re-implement the check correctly, and nobody can audit "what can a Recruiter actually do" by reading one place.

Instead: **centralized, declarative, permission-based** authorization — a single `PermissionsGuard` (NestJS guard) consulted by every protected endpoint via a decorator, backed by a `Role → Permission` mapping that lives in one place.

## 2. Core Model

- **Resource** — a noun in the domain: `job`, `application`, `interview`, `evaluation`, `offer`, `organization`, `user`, `subscription`, etc.
- **Action** — a verb: `create`, `read`, `update`, `delete`, `publish`, `screen`, `shortlist`, `schedule`, `submit`, `approve`, etc.
- **Permission** — `resource:action`, e.g. `job:create`, `application:screen`, `organization:approve`.
- **Role** — a named bundle of permissions. Roles are **platform-defined and seeded**, not user-editable in MVP (an org cannot invent a custom role) — this keeps the permission surface auditable. REQ-RBAC-001 (org-level custom roles) is explicitly deferred to P1/P2; see `open-questions.md`.
- **Role scope** — every role except `SUPER_ADMIN` is **organization-scoped**: a `UserOrganizationRole` row means "this user has this role *within this org*." `SUPER_ADMIN` is platform-scoped (`User.isSuperAdmin`, no org).

## 3. Role → Permission Mapping (MVP baseline)

| Role | Key permissions |
|---|---|
| **Candidate** | `application:create` (own), `application:read` (own), `application:withdraw` (own), `candidateProfile:update` (own), `offer:read` (own), `offer:respond` (own), `onboarding:read` (own), `document:upload` (own) |
| **Company Owner** | all org-scoped permissions below, plus `organization:update`, `user:invite`, `user:remove`, `subscription:manage`, `role:assign` |
| **Recruiter** | `job:create`, `job:update`, `job:publish`, `job:close`, `job:read`, `application:read`, `application:screen`, `application:shortlist`, `pipeline:manage`, `interview:schedule`, `interview:read`, `evaluation:read`, `talentPool:manage` |
| **Hiring Manager** | `application:read`, `evaluation:read`, `application:decide` (hire/reject), `job:read` |
| **Interviewer** | `interview:read` (own assignments only — ownership check, not just role), `evaluation:submit` (own assignment only) |
| **HR Manager** | `offer:create`, `offer:read`, `offer:send`, `document:request`, `document:read` (org), `onboarding:manage` |
| **Super Admin** | `organization:approve`, `organization:reject`, `organization:suspend`, `user:manage` (platform), `subscription:read` (platform), `payment:read` (platform), `analytics:platform`, `auditLog:read` (platform) |

This table is the seed data for `Role`/`Permission`/`RolePermission` (see `database.md`), not something re-derived by hand in each module.

**Design note — some permissions need ownership, not just role.** `interview:read` for an Interviewer is not "any interview in the org," it's "only interviews I'm assigned to." Role-based checks alone can't express this, so the guard layer supports two checks composed together: (1) does the role have this permission at all, and (2) for row-level ownership permissions, does the specific resource belong to/involve this user. This is implemented as an optional second guard (`OwnershipGuard`) or an ownership check inside the service layer immediately after the permission guard passes — **never** rely on the permission check alone for these cases.

## 4. Enforcement Pattern (NestJS)

```ts
// Declarative on the controller — the single source of truth for "what does this endpoint require"
@Post('jobs')
@RequirePermission('job:create')
@RequireTenant()
createJob(@Body() dto: CreateJobDto, @CurrentUser() user: AuthUser) { ... }
```

- `@RequirePermission('job:create')` → `PermissionsGuard` loads the user's roles **for the org in the current request context** (from the access token, or re-verified from DB for sensitive operations — see below), checks the role-permission map, 403s if absent.
- `@RequireTenant()` → `TenantGuard` ensures the request's target resource's `organizationId` matches the authenticated user's active org. This is what makes multi-tenancy enforcement automatic instead of hand-written per endpoint — full detail in `multi-tenancy.md`.
- Ownership checks (interviewer-sees-own-interviews-only) are done in the service layer immediately after guards pass, querying with the userId as an explicit filter — not trusted to the frontend.

**Trust boundary note:** the access token's `roles` claim is a performance optimization (avoids a DB hit on every request), but for **irreversible or sensitive actions** (organization approval, role changes, payment operations, offer sending) the guard re-verifies the role against the database rather than trusting the token claim, to close the ~15-minute staleness window described in `authentication.md` §6. This is a deliberate, documented exception to "trust the token," not applied everywhere (that would defeat the point of a stateless token).

## 5. Platform-level vs. Organization-level Permissions

Two independent permission spaces, never conflated:

- **Organization-level** — everything in §3 except the Super Admin row. Scoped by `organizationId`; a Company Owner of Org A has zero permissions in Org B, full stop.
- **Platform-level** — Super Admin only. These endpoints (`/api/admin/*`) require `user.isSuperAdmin === true` and are **not** tenant-scoped (a Super Admin's actions aren't "within an org" the way a Recruiter's are) — but reading into a specific org's business data (jobs, applications, candidate PII) as Super Admin should still be logged to `AuditLog`, since "can technically access" and "should casually browse" are different things (see NFR table in `requirements.md` — "Data privacy").

## 6. What "Centralized" Means in Practice (mentoring note)

A new developer adding a new endpoint should **never** need to write `if (user.role === X)`. They add one row to the seed permission map (if a genuinely new permission is needed), and one decorator on the controller. If a code review finds a raw role-string comparison anywhere outside the RBAC module itself, that's a CRITICAL finding — flag it immediately, it means the centralized system is being bypassed and drifting out of sync with the permission table.

## 7. Common Mistakes to Avoid

- Checking permissions only in the frontend (hiding a button) and assuming the backend is safe by association — every backend endpoint must independently enforce its own guard.
- Confusing "not authenticated" (401) with "authenticated but not permitted" (403) — return the correct code, and never leak *why* a 403 happened beyond what's safe (don't reveal a resource exists in another tenant — see `multi-tenancy.md` and `security.md` on IDOR).
- Forgetting the ownership layer for Interviewer-type permissions and accidentally letting any Interviewer at the org see every interview because the role check alone passed.
