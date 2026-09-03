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

Status: DRAFT v1.0

## 1. Next.js App Structure

Route groups separate portals so each can have its own layout, auth guard, and navigation without leaking one portal's UI into another:

```
app/
  (public)/            → landing, public job search, job details (no auth)
  (auth)/               → login, register, forgot/reset password, org registration
  (candidate)/           → candidate dashboard, profile, applications, offers
  (org)/                 → recruiter/hiring-manager/interviewer/HR portal
    [orgId]/jobs/
    [orgId]/applications/
    [orgId]/pipeline/
    [orgId]/interviews/
    [orgId]/offers/
    [orgId]/settings/
  (admin)/                → Super Admin portal
    organizations/
    users/
    subscriptions/
    audit-logs/
  components/
    ui/                    → shared design-system primitives (Button, Input, Table, Modal, EmptyState, ErrorState...)
    forms/                  → reusable form components w/ validation wiring
  lib/
    api-client.ts            → typed fetch wrapper (attaches access token, handles 401 → refresh → retry once)
    auth/                     → auth context/hooks (useAuth, useCurrentOrg)
    permissions/               → frontend permission-check helpers (UI convenience only — mirrors backend permission keys, never the source of truth)
```

Each protected route group's `layout.tsx` enforces: authenticated, correct role for that portal, and (for `(org)`) that `[orgId]` in the URL matches the user's active org — a defense-in-depth UI check, since the real enforcement is server-side per `multi-tenancy.md`.

## 2. State & Data

- **Server state** (data from the API): React Query (TanStack Query) — handles caching, refetching, loading/error states consistently, avoids the classic "duplicate fetch logic in every component" anti-pattern called out in the code-quality rules.
- **Client/UI state** (form drafts, modal open/closed, wizard steps): local component state or a light store (Zustand) only where genuinely needed — avoid a heavy global store for things that don't need to be global.
- **Forms:** React Hook Form + a shared Zod schema per DTO, ideally the *same* validation shape mirrored from the backend DTO (not copy-pasted independently, to avoid drift) — frontend validation is for UX responsiveness only, the backend re-validates everything regardless (see `13. VALIDATION`).

## 3. UI States Discipline

Every data-driven view implements four states explicitly, not just the happy path: **loading** (skeleton, not a blank screen), **error** (retry affordance, not a raw error dump), **empty** (helpful message + next action, e.g., "No applications yet — jobs you apply to will show up here"), **populated**. This is a Definition-of-Done item, not optional polish.

## 4. Reusable Components

Anything appearing in more than one portal (data tables with sort/filter/pagination, status badges for Job/Application/Offer states, file upload widgets, confirmation modals) lives in `components/ui` or `components/forms`, never copy-pasted per portal. A code review finding duplicated table/pagination logic across two feature folders is a LOW/MEDIUM finding worth flagging early, before it spreads.
