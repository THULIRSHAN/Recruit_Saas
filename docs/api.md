# API Architecture & Conventions

Status: DRAFT v1.0 — this defines the *rules* every endpoint follows. The full endpoint-by-endpoint contract table is produced per module immediately before that module's implementation phase (to avoid designing APIs for features that may still change shape), and appended here as each phase lands.

## 1. Conventions

- **Base path:** `/api/v1/...` (versioned from day one — costs nothing now, saves pain later).
- **Naming:** plural nouns for collections (`/jobs`, `/applications`), nested resources for clear ownership (`/jobs/:jobId/stages`), verbs only for actions that aren't pure CRUD (`/jobs/:id/publish`, `/offers/:id/accept`).
- **HTTP methods:** `GET` read, `POST` create/action, `PATCH` partial update, `PUT` unused (avoid ambiguity — PATCH covers our needs), `DELETE` soft-delete where the domain requires history (jobs, applications are never hard-deleted; archived/withdrawn instead).
- **Status codes:** `200` success, `201` created, `204` no content (e.g., logout), `400` validation error, `401` not authenticated, `403` authenticated but not permitted (same-tenant only — see `multi-tenancy.md` §5), `404` not found **or** cross-tenant access attempt, `409` conflict (duplicate application, email already registered), `422` semantically invalid (e.g., publishing a job with no pipeline stages), `429` rate-limited, `500` unhandled server error (never with a stack trace in the body — see `security.md`).
- **Pagination:** cursor or offset-based, consistently `?page=1&pageSize=20` with a response envelope `{ data: [...], meta: { page, pageSize, total } }`. Cap `pageSize` server-side (e.g., max 100) to prevent abuse.
- **Filtering/sorting:** query params, e.g. `?status=PUBLISHED&sort=-createdAt`. Documented per-endpoint, not a free-for-all.
- **Error format (consistent across all endpoints):**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary",
    "details": [{ "field": "email", "issue": "must be a valid email" }]
  }
}
```

- **DTOs:** every write endpoint has an explicit `class-validator`-decorated DTO; no endpoint accepts a raw untyped body. Response shapes are also explicit (never `return prisma.job.findMany()` directly — map to a response DTO so internal fields like `passwordHash` can never accidentally leak).

## 2. Example Endpoint Contract (template every module follows)

```
POST /api/v1/jobs
Auth:        required
Permission:  job:create
Tenant:      required (organizationId taken from auth context)
Body:        CreateJobDto { title: string; description: string; department?: string;
                             location?: string; employmentType?: string;
                             pipelineTemplateId?: string }
Success:     201 { data: JobResponseDto }
Errors:      400 (validation), 401, 403 (missing permission),
             422 (referenced pipelineTemplateId belongs to a different org)
```

Every module's endpoint table in later phase docs will follow exactly this shape (method, path, auth, permission, tenant requirement, body, response, errors) so contracts are predictable across the whole API surface — a developer reading one module's docs already knows how to read every other module's.

## 3. Cross-Cutting API Rules

- **Rate limiting** on auth endpoints (`login`, `register`, `forgot-password`) and file upload endpoints — see `security.md`.
- **CORS** restricted to the known frontend origin(s) per environment; never `*` in production.
- **Idempotency:** payment webhook handling (`POST /api/v1/webhooks/stripe`) must be idempotent using Stripe's event ID (`Payment.stripeEventId` unique constraint — see `database.md`), since Stripe retries webhooks.
- **File upload endpoints** (`POST /api/v1/candidates/me/cvs`, document uploads) accept `multipart/form-data`, validate MIME type + size before touching storage — see `security.md` for the full list.

---

# Frontend Architecture

Status: IMPLEMENTED (F1-F6, 2026-09-05). This section originally described a DRAFT v1.0 plan written during Phase 1, before either the backend or a UI design existed; it's rewritten below to describe what was actually built. The build itself was driven by a user-supplied HTML/CSS/JS prototype ("Hirelane") rather than from this doc directly, and where the prototype/this doc's original plan conflicted with the backend's real shape, the backend won (see `docs/open-questions.md` Q33 for the gaps that surfaced doing this).

## 1. Next.js App Structure

Route groups separate portals so each can have its own layout, auth guard, and navigation without leaking one portal's UI into another:

```
app/
  (public)/                     → landing (job search), jobs/[id] (job detail) — no auth
  (auth)/                        → login, register (candidate), register/organization
  (candidate)/                    → dashboard, dashboard/applications[/[id]], dashboard/offers[/[id]],
                                     dashboard/profile, apply (job application form)
  (org)/                           → recruiter/hiring-manager/interviewer/HR portal
    org/                            → dashboard
    org/jobs[/new|/[id]/edit|/[id]/pipeline]
    org/jobs/[id]/applications/[appId][/schedule|/offer]
    org/interviews                  → interviewer's own assigned interviews + evaluation submission
  (admin)/                          → Super Admin portal
    admin                            → platform overview
    admin/organizations               → approval queue
components/
  ui/                                → shared design-system primitives (Button, Badge, Card, Field/Input/Select/
                                        Textarea, Avatar, Pill, Divider, StatCard, EmptyState, Stars)
  layout/                             → AppShell (shared sidebar/user-block layout for all three authed portals),
                                        PublicTopbar
lib/
  api.ts                               → typed fetch wrapper (attaches access token, handles 401 → refresh → retry
                                          once, deduplicated against concurrent refresh attempts)
  auth-context.tsx, org-context.tsx     → AuthProvider/useAuth, OrgProvider/useOrg
  use-require-auth.ts                    → shared auth-guard hook (redirects to /login?next=... with a role
                                            predicate per portal)
  types.ts                                → response-shape types mirroring each backend service's toDetail()
```

**No `[orgId]` in any `(org)` route**, unlike the original DRAFT v1.0 sketch this section used to have. The backend never takes an org id from the URL for org-scoped resources either — every org-scoped endpoint derives `organizationId` from the caller's JWT (`docs/multi-tenancy.md`'s "never from client input" rule) — so there was never a URL-level org id to guard against; the frontend's route shape just followed that reality once it existed.

Each protected route group's `layout.tsx` enforces auth + role via `useRequireAuth`, a client-side, defense-in-depth check only — the real enforcement is server-side per `multi-tenancy.md`, same reasoning as originally planned.

**No `admin/users`, `admin/subscriptions`, or `admin/audit-logs`** — the backend has no endpoint to list users platform-wide or read the (write-only) `AuditLog`, and there's no admin subscriptions view in the source prototype either. Building those pages against nothing would mean fabricating data; they're a documented gap (see `docs/open-questions.md`), not a silent omission.

## 2. State & Data

Actually built: plain `useEffect` + `useState` data fetching through `lib/api.ts`, no React Query/TanStack Query, no Zustand, no React Hook Form + Zod, despite DRAFT v1.0 calling for all four. This was a deliberate simplification, not an oversight — with ~25 pages and mostly one fetch (or one mutation) per page, the caching/refetch machinery React Query exists for had no real duplicate-fetch problem to solve yet, and every form's validation is a handful of controlled inputs with inline error state, not complex enough to justify a schema library on top of what `class-validator` already enforces server-side. If the page count or form complexity grows enough that this becomes real duplicated logic (the same "don't repeat yourself" trigger the code-quality rules already call out), reach for React Query first — it's the highest-leverage of the three.

## 3. UI States Discipline

Every data-driven view distinguishes **loading** (a plain "Loading…" today, not yet a skeleton — the one place this build fell short of the DRAFT v1.0 bar), **error** (inline message near the action that failed, not a raw error dump — `ApiError.message` surfaced directly since the backend's validation messages are already user-appropriate), **empty** (the shared `EmptyState` component, with a next-action link where one exists), and **populated**.

## 4. Reusable Components

Shared primitives live in `components/ui` (see the file list above) and `components/layout` (`AppShell` is used by all three authed portals — candidate/org/admin — parameterized by nav items). There is no separate `components/forms` — each form's fields are inline in its page, since none were complex or repeated enough yet to justify extracting one (see §2's reasoning).
