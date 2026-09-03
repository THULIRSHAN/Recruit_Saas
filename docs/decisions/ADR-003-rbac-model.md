# ADR-003: Centralized Permission-Based RBAC

Status: Proposed
Date: 2026-09-03

## Context

The brief explicitly forbids scattered role checks and requires a centralized authorization strategy across 7 actor types with both organization-level and platform-level permissions.

## Decision

Model authorization as `resource:action` **permissions** grouped into platform-seeded **roles**, checked via a single declarative `PermissionsGuard` + `@RequirePermission()` decorator, with a separate ownership-check layer for row-level cases (e.g., an Interviewer's own assignments). Full design in `authorization.md`.

## Alternatives Considered

- **Simple role-string checks (`if (user.role === 'RECRUITER')`) scattered per endpoint:** explicitly rejected by the brief and by general practice — unauditable, easy to get subtly wrong per-endpoint, and impossible to answer "what can a Recruiter do" without grepping the whole codebase.
- **Attribute-based access control (ABAC) / policy engine (e.g., CASL, OPA):** more powerful and flexible than needed for MVP's fixed role set; adds a learning curve and a new dependency the team would need to master under time pressure. Worth revisiting if org-custom roles (deferred requirement REQ-RBAC-001) are built later and the fixed role model becomes limiting.
- **Chosen (permission-based RBAC with a fixed seed):** matches the brief's explicit example structure (Recruiter/Interviewer/Super Admin permission lists), is simple enough for 5 students to implement correctly, and is easy to audit by reading one seed table.

## Consequences

- Positive: one place to answer "what can role X do," straightforward to test, straightforward to extend with new permissions as modules are built.
- Negative: does not support org-defined custom roles in MVP — orgs get the fixed role set. Explicitly scoped as deferred (`requirements.md` REQ-RBAC-001, `open-questions.md`).
- Follow-up: if custom roles are added later, the `Role`/`Permission`/`RolePermission` tables already support it structurally (just needs an org-scoped "custom role" CRUD UI/API) — the data model doesn't need to change.
