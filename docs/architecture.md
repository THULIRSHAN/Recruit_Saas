# System Architecture

Status: DRAFT v1.0

## 1. Architectural Style: Modular Monolith

**Decision:** a single NestJS deployable, internally organized into strict, independently-testable modules, backed by one PostgreSQL database (schema-separated by module ownership, not by physical database).

**Why not microservices:** with 5 student developers and a semester timeline, microservices would add distributed-systems overhead (service discovery, network failure handling, distributed transactions for a workflow that is inherently transactional — e.g., "create application + advance pipeline stage + send notification" wants to be one unit of work) without a corresponding benefit. Nobody on the team needs to scale one module independently yet.

**Why not a single giant module:** a "God module" makes it impossible for 5 people to work without constant merge conflicts, and hides the tenant/permission boundaries that are the whole point of this system.

**The compromise — modular monolith:** each domain module owns its own Prisma models, services, controllers, and DTOs, and communicates with other modules only through explicit service interfaces (never by reaching into another module's Prisma models directly). This gets most of microservices' *organizational* benefit (clear ownership, parallel work, replaceable boundaries) without the *operational* cost. If, after MVP, one module (e.g., Notifications, or a future AI matching service) genuinely needs to scale independently, its boundary is already clean enough to extract.

This is recorded formally in `decisions/ADR-001-modular-monolith.md`.

## 2. Backend Module Breakdown

| Module | Responsibility | Depends on | Notes |
|---|---|---|---|
| **Auth** | Registration, login, JWT issuance/refresh, password reset, email verification | Users | Owns no business data beyond credentials/tokens. |
| **Users** | User profile records (all actor types share one `User` table), org membership | — | Central identity module; almost everything depends on it. |
| **Organizations** | Org registration, approval workflow, org settings, tenant record | Users | Owns the `Organization` entity that every tenant-scoped module foreign-keys to. |
| **RBAC (Roles & Permissions)** | Central authorization: role/permission definitions, guard logic, permission checks | Users, Organizations | Cross-cutting — exposed as a `PermissionsService`/guard used by every other module, not a "feature" module itself. |
| **Jobs** | Job CRUD, publish/close lifecycle, public search | Organizations, RBAC | |
| **Candidates** | Candidate profile, CV, education/experience/skills | Users | Candidate-owned data, not org-owned. |
| **Applications** | Application submission, screening, shortlisting, withdrawal | Jobs, Candidates, RecruitmentPipeline | |
| **Recruitment Pipeline** | Stage definitions/templates, stage-transition engine, transition history | Jobs, Applications | Deliberately separated from Applications: pipeline *shape* (stages, templates) is org-level configuration reused across jobs, while Applications is the *instance* data flowing through it. |
| **Interviews** | Scheduling, panel assignment, interviewer-scoped visibility | Applications, Users, RBAC | |
| **Evaluations** | Interviewer scoring/feedback, aggregation for decision-makers | Interviews | Kept separate from Interviews so evaluation-visibility rules (never shown to the candidate, staged visibility among panelists) can be enforced independently of scheduling logic. |
| **Hiring & Offers** | Hiring decision, offer creation/send/accept/decline | Applications, Evaluations | |
| **Onboarding & Documents** | Post-offer document requests, uploads, checklist | Offers, Candidates | |
| **Talent Pools** | Tagging/grouping candidates for future roles | Candidates, Organizations | |
| **Universities** | University partnership records, linking candidate pools to a university source | Organizations, Candidates | |
| **Subscriptions** | Plan selection, plan limits (seats, active jobs) | Organizations | |
| **Payments** | Stripe integration, payment records, webhook handling | Subscriptions | Isolated from Subscriptions logic itself so Stripe-specific code doesn't leak into business rules. |
| **Notifications** | Email/in-app notification dispatch, templates | (listens to events from all modules) | Implemented as an internal event-driven module (see §4) so feature modules never import an SMTP client directly. |
| **Analytics** | Aggregated read-models for dashboards (org-level and platform-level) | reads from Jobs/Applications/Interviews/etc. | Read-only by design — never a source of truth, only a query/aggregation layer. |
| **Audit Logs** | Immutable log of sensitive actions | (listens to events from all modules) | Also event-driven; write-once, queried only by Super Admin / org owners for their own org. |
| **Admin** | Super Admin operations: org approval, platform user management, moderation | Organizations, Users, Subscriptions | Platform-level, not tenant-scoped. |

**Module communication rules:**
- A module may call another module's **service layer** (its public interface), never its Prisma models or DTOs directly.
- Cross-cutting concerns (notifications, audit logging) are triggered via an internal event bus (NestJS `EventEmitter2` is sufficient for MVP scale — no message broker needed yet) so that, e.g., the Applications module doesn't need to know Notifications exists; it just emits `application.created`.
- RBAC is the one module every other module depends on directly (as a guard/decorator), because authorization must be enforced at the point of access, not after the fact.

## 3. High-Level Component Diagram

```
                        ┌─────────────────────────┐
                        │   Next.js Frontend       │
                        │  (Candidate / Org /       │
                        │   Admin portals)          │
                        └────────────┬─────────────┘
                                     │ REST (JWT bearer)
                        ┌────────────▼─────────────┐
                        │   NestJS API (monolith)   │
                        │ ┌───────────────────────┐ │
                        │ │ Auth · RBAC (guards)   │ │  ← cross-cutting
                        │ └───────────────────────┘ │
                        │  Users · Organizations     │
                        │  Jobs · Candidates         │
                        │  Applications · Pipeline   │
                        │  Interviews · Evaluations  │
                        │  Hiring · Offers           │
                        │  Onboarding · Documents    │
                        │  TalentPools · Universities │
                        │  Subscriptions · Payments  │
                        │  Notifications (events)    │
                        │  AuditLogs (events)        │
                        │  Analytics (read-model)    │
                        │  Admin                     │
                        └────────────┬─────────────┘
                                     │
                 ┌───────────────────┼───────────────────┐
                 ▼                   ▼                   ▼
          ┌─────────────┐   ┌───────────────┐   ┌────────────────┐
          │ PostgreSQL   │   │ S3/Cloudinary │   │ Stripe (test)   │
          │ (Prisma)     │   │ (CVs, docs)   │   │                 │
          └─────────────┘   └───────────────┘   └────────────────┘
```

## 4. Backend Internal Layering (per module)

```
Controller  →  DTO validation (class-validator)  →  Guard(s) (Auth, Permission, Tenant)
     │
     ▼
  Service (business logic — the ONLY layer allowed to talk to Prisma or other services)
     │
     ▼
  Prisma Repository (module owns its own models)
     │
     ▼
  PostgreSQL
```

Rule: **controllers stay thin** (parse request, call one service method, return). All business rules, validation beyond shape-checking, and orchestration across services live in the service layer. This is non-negotiable for code review — see `21. Code Quality` in the working agreement.

## 5. User Journeys (User → Page → Action → API → DB → Result)

**Candidate applies for a job**
Candidate → Job Details page → clicks Apply → `POST /api/applications` → API validates candidate profile complete + job is `PUBLISHED` + no duplicate application → creates `Application` (stage = pipeline's first stage) → emits `application.created` event → Notifications module emails the org's recruiters → Candidate Dashboard shows the new application under "Applied".

**Recruiter publishes a job**
Recruiter → Job Editor → fills fields, defines/attaches pipeline template → Save (DRAFT) → `POST /api/jobs` → validated & tenant-scoped to recruiter's org → clicks Publish → `PATCH /api/jobs/:id/publish` → validates ≥1 pipeline stage exists → `status=PUBLISHED` → job now appears in public search (`GET /api/jobs/search`, unauthenticated).

**Recruiter schedules an interview**
Recruiter → Application detail (Pipeline stage: Interview) → Schedule Interview → picks date/panel → `POST /api/interviews` → tenant + role checked → assigned interviewers looked up (must belong to same org) → `Interview` + `InterviewPanelMember` rows created → emits `interview.scheduled` → interviewers notified; interviewer's own dashboard (`GET /api/interviews/mine`) now lists it.

**Interviewer submits evaluation**
Interviewer → My Interviews → completed interview → Evaluation form → `POST /api/evaluations` → guard checks the interviewer is actually assigned to this interview (ownership, not just role) → `Evaluation` created, linked to `Interview` + `Application` → visible to Recruiter/Hiring Manager on the Application detail page's "Evaluations" panel.

**Hiring Manager makes a hiring decision → Offer → Onboarding**
Hiring Manager → Application detail → reviews aggregated evaluations → Mark as Hired → `PATCH /api/applications/:id/decision` → HR Manager → Create Offer → `POST /api/offers` → candidate notified → Candidate → Offers page → Accept → `PATCH /api/offers/:id/accept` → triggers `Onboarding` record creation → HR Manager → Onboarding checklist → requests documents → Candidate uploads → private storage, signed URL access only.

## 6. Frontend Architecture (summary — full detail in `frontend-architecture.md`)

Next.js App Router with route groups per portal: `(public)`, `(auth)`, `(candidate)`, `(org)`, `(admin)`. Each protected group has its own layout enforcing auth + role, and a shared design-system component library (`/components/ui`) used by all portals to avoid duplicated UI logic.

## 7. What Explicitly Stays Out of MVP Architecture

- AI CV screening / matching / recommendations — no service, no queue, no model integration yet. Only a documented extension point (see ADR-005).
- Real-time features (websockets for live pipeline updates) — polling/refetch is sufficient for MVP; revisit if the team has capacity.
- Message broker (Kafka/RabbitMQ/SQS) — in-process event emitter is enough at this scale; do not add operational complexity the team doesn't need yet.
