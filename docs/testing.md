# Testing Strategy

Status: DRAFT v1.0 — "a feature is not complete simply because it works manually" (working agreement §16). This document defines what "tested" means per layer.

## 1. Testing Pyramid for This Project

| Layer | Tool | What it covers | When written |
|---|---|---|---|
| **Unit tests** | Jest | Service-layer business logic in isolation (mocked Prisma) — pipeline stage transition rules, permission-mapping logic, offer expiry logic, validation edge cases | Alongside the service code, same PR |
| **Integration tests** | Jest + a real (test) Postgres via `docker-compose` or Testcontainers | Service + Prisma together — verifies actual queries, constraints, and **tenant-isolation filters** work against a real DB, not a mock that could hide a missing `where` clause | Alongside module implementation |
| **API/E2E-lite tests** | Supertest against the NestJS app | Full HTTP request → guard → controller → service → DB → response, including auth headers and error shapes | Per endpoint, before a module is considered done |
| **Frontend E2E** | Playwright (already available in this environment) | Critical user journeys end-to-end against a running app: candidate applies for a job, recruiter screens & shortlists, interviewer submits evaluation, hiring manager decides, offer accept → onboarding | For each major journey listed in `architecture.md` §5, added once the corresponding phase's UI exists |

Not every layer is required for every line of code — unit tests for pure logic, integration tests for anything touching Prisma, API tests for every endpoint, E2E for the handful of critical cross-module journeys. Duplicating the same coverage at every layer wastes the team's limited time.

## 2. Mandatory Test Cases Per Endpoint (the actual checklist)

For **every** endpoint that touches tenant-owned data, the following cases are required before merge — this list is what `multi-tenancy.md` §7 refers to as the Definition-of-Done gate:

1. Happy path (valid input, correct role, correct org) → expected success response.
2. Invalid input → 400 with validation details.
3. Unauthenticated request → 401.
4. Authenticated but wrong role/permission → 403.
5. **Authenticated, correct role, but wrong organization (cross-tenant attempt) → 404, and the response contains none of the target resource's data.** This is the single most important test case in the whole project and must exist for every tenant-scoped endpoint without exception.
6. Resource not found (valid org, nonexistent ID) → 404.
7. Duplicate/conflict case where applicable (double-application, duplicate email) → 409.
8. Ownership-scoped endpoints (e.g., interviewer reading interviews): correct role but *not* the assigned owner → 403/404 as appropriate, verified separately from the tenant check.

## 3. Example: Applications Module Test Matrix

| Case | Expected |
|---|---|
| Candidate applies to a `PUBLISHED` job they haven't applied to | 201, `Application` created |
| Candidate applies twice to the same job | 409 |
| Candidate applies to a `DRAFT`/`CLOSED` job | 422 |
| Recruiter at Org A reads an application belonging to Org B | 404 |
| Recruiter at Org A screens an application at Org A | 200, stage updated, `ApplicationStageHistory` row created |
| Interviewer (not assigned to this application's interview) tries to submit an evaluation | 403 |
| Unauthenticated request to any of the above | 401 |

Every module's phase doc will include a matrix like this before implementation starts.

## 4. CI Gate

Per `deployment.md`, every pull request runs: install → lint → typecheck → unit tests → integration tests (against a throwaway test DB) → build. A PR cannot merge with a red pipeline. E2E tests run on a slower cadence (e.g., nightly or pre-release) since they're heavier, not on every commit, to keep PR feedback fast.

## 5. What "Done" Testing Looks Like (tie-back to Definition of Done)

A feature is not merged until: the mandatory test cases in §2 exist and pass, any new business rule has a corresponding unit test, any new tenant-owned entity has the cross-tenant 404 test, and CI is green. Manual click-through testing is encouraged during development but never substitutes for the automated suite — manual testing doesn't survive the next person's refactor.
