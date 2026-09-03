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

Phase 1 (Requirements & Architecture) — complete; `docs/open-questions.md` resolved 2026-09-03.
Phase 2 (Project Setup) — in progress (M1: Project Skeleton).
