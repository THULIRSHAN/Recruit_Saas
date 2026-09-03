# ADR-002: Shared Database, Row-Level Multi-Tenancy

Status: Proposed
Date: 2026-09-03

## Context

The platform must guarantee zero cross-tenant data access between organizations (§6 of the brief, treated as a critical architectural requirement). Three standard strategies exist: database-per-tenant, schema-per-tenant, and shared-schema row-level isolation.

## Decision

Use **shared database, shared schema, row-level isolation**: every tenant-owned table carries an `organizationId` column, enforced by a mandatory tenant filter at the service layer (backed by a guard as defense-in-depth). See `multi-tenancy.md` for the full enforcement design.

## Alternatives Considered

- **Database-per-tenant:** strongest isolation, but operationally heavy — a new database + migration run per organization signup, connection pool management multiplies per tenant, and Prisma's tooling isn't designed around dynamic per-tenant datasource switching. Massive overkill for a student project's tenant count and team size.
- **Schema-per-tenant (one Postgres schema per org, same database):** better isolation than row-level, but still requires dynamic schema provisioning/migration per org, and Prisma's multi-schema support is more friction than the team should take on given the timeline. Reconsider only if a real production deployment with strict compliance needs (e.g., contractual data-residency-per-tenant) emerges later.
- **Row-level (chosen):** standard, well-supported by Prisma, and — critically — the isolation guarantee comes from *code discipline enforced structurally* (the `TenantScopedService` base pattern in `multi-tenancy.md` §4), which is also the most valuable thing for the team to learn, since it's the approach they'll most likely meet again in industry.

## Consequences

- Positive: simplest operationally; single migration path; easiest for a 5-person team to reason about and test.
- Negative: the isolation guarantee is a *code-level* guarantee, not a *database-level* one (Postgres itself doesn't refuse a cross-tenant query the way a separate database physically would) — this raises the bar on code review and automated testing (`testing.md` §2 case 5) to be non-negotiable.
- Mitigation: consider Postgres Row-Level Security (RLS) policies as a second, database-enforced layer if the team has capacity post-MVP — noted here as a future hardening step, not required for MVP.
