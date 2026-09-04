# Applicant Tracking & Recruitment Management SaaS — Project Documentation

This is the **Phase 1 deliverable**: complete requirement engineering and architecture analysis, produced before any application code. Per the team's working agreement, implementation does not begin until the team has reviewed this and confirmed the open decisions below.

## Start Here

1. **`docs/open-questions.md`** — read this first. Ten specific decisions need team confirmation before certain phases can start; each has a recommendation, none are final.
2. **`docs/requirements.md`** — system overview, actors, functional & non-functional requirements, detailed specs for every MVP-critical (P0) requirement.
3. **`docs/architecture.md`** — module breakdown, why a modular monolith, component diagram, user journeys (User → Page → Action → API → DB → Result) for every major workflow.
4. **`docs/database.md`** — entity list, ERD description, full Prisma schema proposal, index strategy.
5. **`docs/authentication.md`** / **`docs/authorization.md`** / **`docs/multi-tenancy.md`** — the three documents that together define the security model; multi-tenancy in particular should be read by every developer before touching any endpoint.
6. **`docs/api.md`** — REST conventions + frontend (Next.js) architecture.
7. **`docs/security.md`** / **`docs/testing.md`** — security checklist and required test coverage per endpoint.
8. **`docs/deployment.md`** — Docker/Nginx/CI-CD design.
9. **`docs/team-plan.md`** — phased implementation order, dependency map, per-developer module ownership for the 5-person team, git workflow, recommended MVP scope.
10. **`docs/decisions/`** — ADRs recording the "why" behind the five biggest architectural calls (modular monolith, tenancy strategy, RBAC model, file storage, AI-deferred).
11. **`CLAUDE.md`** — the condensed operating rules for whoever (human or AI) writes code in this repo from here on.

## Status

Phase 1 (Requirements & Architecture) — complete; `docs/open-questions.md` resolved 2026-09-03 (Q1–Q10) and 2026-09-04 (Q11–Q27).
Phase 2/3/4 (Project Setup, Database, Auth, RBAC) — M1 (Project Skeleton), M2 (Database Foundation), M3 (Authentication), and M4 (RBAC + Multi-tenancy) all complete as of 2026-09-04.
Phase 5 (Organizations) — M5 complete as of 2026-09-04: organization self-registration + Super Admin approve/reject/list (REQ-AUTH-002/003), self-service org settings (`GET`/`PATCH /organizations/me`), and staff invitations, both the create side (`POST /organizations/me/invitations`) and accept side (`POST /invitations/:token/accept`, REQ-AUTH-008). First real consumer of M4's PermissionsGuard (including its `reVerify` DB re-check for sensitive actions).
Phase 6 (Jobs) — M6 complete as of 2026-09-04: org-scoped Job CRUD (first real consumer of M4's TenantGuard), reusable pipeline templates + per-job recruitment stage management (including applying a template to a job), the publish/close/archive lifecycle (REQ-JOB-001, enforcing "≥1 stage to publish"), and public job search + job details (REQ-JOB-005) — the one deliberately cross-tenant endpoint class in the system.
Phase 7 (Candidate Profile & Applications) — complete as of 2026-09-04: candidate profile CRUD (M7.1), CV upload behind a swappable `StorageService` abstraction with signed URLs (M7.2, ADR-004/Q20), job application submission — create/list/view/withdraw, scoped to the caller, with the DB-level "one active application per job+candidate" rule enforced via a partial unique index (M7.3), and org-staff application screening (M7.4, REQ-APP-002/003): pass advances an application to its job's next pipeline stage, reject sets a terminal status with an optional reason, both logged (`ApplicationStageHistory`/`AuditLog`). M7.4 also fixed a real cross-role over-permission bug in `PermissionsGuard` (Q23) that the new endpoints' e2e tests caught.
Phase 8 (Interviews) — M8.1 complete as of 2026-09-04: Recruiter schedules an interview (date/time, mode, panel of one or more interviewers, REQ-INT-001/002), rescheduling keeps history (old slot marked `RESCHEDULED`, linked to a fresh one via `rescheduledToId`, panel carried over), and an interviewer's own view (`GET /interviews/me`) is filtered in the query layer by panel membership, not just role (REQ-INT-003).
Phase 9 (Evaluations & Hiring) — M9 complete as of 2026-09-04: interviewer evaluation submission (per-competency 1-5 scores + comment + recommendation, REQ-EVAL-001) with no interviewer-facing read path at all — an evaluation is never visible to any interviewer, avoiding anchoring bias without the org-configurable mechanism the requirement describes (deferred, Q25); Recruiter/Hiring Manager's aggregate evaluation view (REQ-EVAL-002, fixed a Recruiter permission-catalog gap, Q24); and the Hiring Manager's final HIRE/REJECT decision (REQ-HIRE-001, Q6).
Phase 10 (Offers) — M10 complete as of 2026-09-04: HR Manager creates an offer for a HIRED application (title/compensation/optional start date/expiry, REQ-OFFER-001), and the candidate accepts or declines within the expiry window (REQ-OFFER-002) — a `SENT` offer past its `expiresAt` is lazily flipped to `EXPIRED` on access rather than needing a scheduled job. Fixed an `offer:read` permission-catalog gap for both HR Manager and Candidate (Q26); offer-letter document attachment and "reopen the pipeline after a decline" are explicitly out of scope for this ticket (Q26).
Phase 11 (Onboarding) — M11 complete as of 2026-09-04: REQ-DOC-001/002 and REQ-ONB-001 had no main flow specified anywhere (`requirements.md` explicitly deferred it to this phase) — wrote it, then built it: HR Manager starts onboarding with a task list once the offer is `ACCEPTED`, requests further documents incrementally, and explicitly marks each task complete after review (never auto-completed by an upload); the candidate views their checklist and uploads documents per task via the same `StorageService`/signed-URL pattern as CV upload. Added a genuinely new `onboarding:read` permission for Candidate (Q27, unlike the missing-grant gaps in Q17/Q21/Q23/Q24/Q26 — no existing key fit).

## Running Locally

Requires Node.js 24 (see `.nvmrc`) and Docker Desktop.

```
cp .env.example .env
docker compose up --build
```

- Backend: http://localhost:3001 (health check at `/health`)
- Frontend: http://localhost:3000
- Postgres: `localhost:5432` (credentials in `.env`)

To run a single service outside Docker (faster iteration), install
dependencies once at the repo root (`npm install`) and use that workspace's
scripts, e.g. `cd backend && npm run start:dev` or `cd frontend && npm run
dev`. The Postgres container's port is published to the host, so a
natively-run backend can still reach it via the `DATABASE_URL` in `.env`.

### Common commands (run from repo root)

```
npm run lint         # both workspaces
npm run typecheck    # both workspaces
npm run test          # both workspaces
npm run build          # both workspaces
npm run format:check    # Prettier check, whole repo (code only, not /docs)
npm run format           # Prettier write, whole repo (code only, not /docs)
docker compose down -v # stop and wipe the local database volume
```
