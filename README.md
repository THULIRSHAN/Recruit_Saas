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

Phase 1 (Requirements & Architecture) — complete; `docs/open-questions.md` resolved 2026-09-03 (Q1–Q10) and 2026-09-04 (Q11–Q16).
Phase 2/3/4 (Project Setup, Database, Auth, RBAC) — M1 (Project Skeleton), M2 (Database Foundation), M3 (Authentication), and M4 (RBAC + Multi-tenancy) all complete as of 2026-09-04.
Phase 5 (Organizations) — M5 complete as of 2026-09-04: organization self-registration + Super Admin approve/reject/list (REQ-AUTH-002/003), self-service org settings (`GET`/`PATCH /organizations/me`), and staff invitations, both the create side (`POST /organizations/me/invitations`) and accept side (`POST /invitations/:token/accept`, REQ-AUTH-008). First real consumer of M4's PermissionsGuard (including its `reVerify` DB re-check for sensitive actions) — `TenantGuard`'s first consumer remains M6 (Job model). M6 (Jobs) next.

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
