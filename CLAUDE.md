# CLAUDE.md — Project AI Instructions

This file governs how Claude (or any AI assistant) should work on this repository. It is authoritative for coding conventions and business rules; the `/docs` folder is authoritative for design rationale. When they conflict, treat it as a documentation bug and flag it rather than picking one silently.

## Project Overview

Applicant Tracking & Recruitment Management SaaS platform — multi-tenant, built by a 5-person student team as a production-quality learning project. Full context: `docs/requirements.md` and `docs/architecture.md`.

## Technology Stack

Frontend: Next.js, TypeScript, Tailwind CSS. Backend: NestJS, TypeScript. Database: PostgreSQL + Prisma. Auth: JWT + rotating refresh tokens. File storage: Cloudinary (recommended, pending confirmation — see `docs/open-questions.md` Q8) or S3. Payments: Stripe test mode. DevOps: Docker, Nginx, GitHub Actions.

## Non-Negotiable Rules

1. **No scattered authorization checks.** Every protected endpoint uses `@RequirePermission()` + `@RequireTenant()`. A raw `if (user.role === X)` outside the RBAC module is a bug. See `docs/authorization.md`.
2. **Every tenant-scoped query filters by `organizationId` taken from the authenticated context, never from client input.** Cross-tenant access returns 404, not 403 or data. See `docs/multi-tenancy.md`. This is the single most important rule in the codebase.
3. **Controllers stay thin.** Business logic lives in services. A controller method should be parse → call one service method → return.
4. **No module reaches into another module's Prisma models directly** — only through its public service interface, or via emitted events for cross-cutting concerns (notifications, audit logs). See `docs/architecture.md` §2.
5. **Every write endpoint validates via a `class-validator` DTO.** Never trust the frontend as the actual control.
6. **Every tenant-owned endpoint ships with a cross-tenant test case** (correct role, wrong org → 404, no data leaked) before merge. See `docs/testing.md` §2.
7. **No secrets in source control.** `.env.example` documents required variables; real values live only in local/deployment environment config.
8. **No AI features** (CV screening, matching, recommendations) unless explicitly requested — see `docs/decisions/ADR-005-ai-features-deferred.md`.
9. **Do not silently resolve ambiguous business rules.** If a requirement is unclear, check `docs/open-questions.md` first; if it's not listed, add it and flag it rather than guessing.

## Business Rules Quick Reference

- A candidate may not have more than one active (non-withdrawn) application to the same job.
- Job publishing requires at least one recruitment pipeline stage to exist.
- An interviewer can submit exactly one evaluation per interview assignment, and can only see interviews/candidates they're assigned to.
- Organizations are unusable (cannot post jobs, staff cannot meaningfully log in) until Super Admin approval (`status: PENDING_APPROVAL → ACTIVE`).
- Public job search only ever returns `PUBLISHED` jobs belonging to `ACTIVE` organizations.

Full detail, including the still-open decisions above (multi-role users, evaluation shape, notification defaults, etc.), is in `docs/requirements.md` and `docs/open-questions.md`.

## Development Commands

To be filled in during Phase 2 project setup (exact scripts depend on the chosen monorepo tooling — e.g., Turborepo/Nx/plain npm workspaces). Placeholder structure:

```
# Backend
cd backend && npm run start:dev      # dev server
cd backend && npm run test           # unit + integration tests
cd backend && npx prisma migrate dev # apply migrations locally

# Frontend
cd frontend && npm run dev

# Full stack (dev)
docker compose up
```

## Testing Commands

```
npm run lint
npm run typecheck
npm run test           # unit + integration
npm run test:e2e       # API/E2E-lite (Supertest)
npx playwright test    # frontend E2E
```

(Exact script names to be confirmed once Phase 2 scaffolding lands — update this section then.)

## Git Conventions

Branches: `main`, `develop`, `feature/<module>-<desc>`, `bugfix/...`, `hotfix/...`. Commits: conventional style (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`), small and scoped. Every PR touching tenant-owned data needs the cross-tenant test case (rule 6 above) before review. Full workflow: `docs/team-plan.md` §6.

## Documentation Map

`docs/requirements.md` (SRS) · `docs/architecture.md` · `docs/database.md` · `docs/api.md` (+ frontend architecture) · `docs/authentication.md` · `docs/authorization.md` · `docs/multi-tenancy.md` · `docs/security.md` · `docs/testing.md` · `docs/deployment.md` · `docs/team-plan.md` · `docs/open-questions.md` · `docs/decisions/ADR-*.md`.

## Working Process for New Features

For every new feature: understand the requirement (check `docs/requirements.md` and `docs/open-questions.md` first) → identify affected modules and dependencies → identify business rules and security concerns → propose approach → identify DB/API/frontend changes → identify tests → implement incrementally → run lint/typecheck/tests → review against the Definition of Done → explain what changed → state the next recommended step. Do not skip straight to code for anything non-trivial.
