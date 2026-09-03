# ADR-001: Modular Monolith over Microservices

Status: Proposed
Date: 2026-09-03

## Context

The platform has ~18 candidate modules (Auth, Jobs, Applications, Interviews, Payments, etc.). The brief explicitly asks to avoid both "a single giant module" and "unnecessary microservices." The team is 5 student developers working within a semester timeline, with varying experience levels.

## Decision

Build a **modular monolith**: one NestJS deployable, organized into strictly-bounded modules, each owning its own Prisma models and exposing only a service-layer interface to other modules. One PostgreSQL database.

## Alternatives Considered

- **Microservices per domain (Jobs service, Applications service, etc.):** rejected. Would require distributed transaction handling for inherently-transactional workflows (e.g., application creation touching Applications + Pipeline + Notifications), service discovery, network resilience patterns, and per-service CI/CD — none of which the team has bandwidth to build correctly in a semester, and none of which is justified by the actual scale (a student project demo, not a system serving independent scaling needs per module today).
- **Single undifferentiated module ("fat" NestJS app with no internal boundaries):** rejected. Makes 5-person parallel work conflict-prone and makes the tenant/permission boundaries (the system's core requirement) hard to audit, since there's no structural enforcement of "who's allowed to touch what."

## Consequences

- Positive: clear module ownership enables the 5-person split in `team-plan.md`; a module's boundary is clean enough to extract into a real microservice later if a genuine scaling need appears (e.g., Notifications under heavy load, or a future AI matching service).
- Negative: requires discipline — a developer under time pressure may be tempted to import another module's Prisma model directly "just this once." Code review must catch this (see `architecture.md` §2 module communication rules).
- Follow-up: if any module's independent-scaling need becomes real post-MVP, revisit this ADR rather than silently working around the monolith.
