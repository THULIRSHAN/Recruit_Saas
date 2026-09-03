# Team Plan: Phases, Dependencies, Responsibility Mapping, Git Workflow

Status: DRAFT v1.0 — assign real names to "Dev 1..5" once the team confirms who owns what; the module split itself is the important decision.

## 1. Implementation Phases (adjusted from the brief's suggested order, based on actual dependencies)

| Phase | Name | Depends on | Can start in parallel with |
|---|---|---|---|
| 1 | Requirements & architecture (this document set) | — | — |
| 2 | Project setup (monorepo, Docker, CI skeleton, lint/format config) | Phase 1 | — |
| 3 | Database foundation (Prisma schema, migrations, seed data for Roles/Permissions/Plans) | Phase 2 | — |
| 4 | Authentication & authorization (Auth module, RBAC module, guards) | Phase 3 | Frontend shell/design system can start now |
| 5 | Organization & tenant management (org registration, Super Admin approval flow) | Phase 4 | Candidate profile backend (Phase 6) can start once Phase 4 lands |
| 6 | Candidate management (profile, CV upload) | Phase 4 | Job management (Phase 7) |
| 7 | Job management (CRUD, publish, public search) | Phase 5 | Candidate management (Phase 6) |
| 8 | Applications (submit, screen, shortlist) | Phases 6 + 7 | — |
| 9 | Recruitment pipeline (stage templates, transitions) | Phase 7 | Can overlap with Phase 8's early work since both land on `Application`/`Job` |
| 10 | Interviews & evaluations | Phases 8 + 9 | — |
| 11 | Hiring decisions & offers | Phase 10 | — |
| 12 | Onboarding & documents | Phase 11 | Talent pools & universities (Phase 13) — independent domain |
| 13 | Talent pools & universities | Phase 5 (org must exist) | Can be pulled forward earlier if a developer is free — low coupling to the core pipeline |
| 14 | Notifications | Event hooks exist from Phase 4 onward | Should be scaffolded early (Phase 4-5) even if content is added incrementally per later phase, since every phase from 5 onward wants to emit events |
| 15 | Subscriptions & payments | Phase 5 | — |
| 16 | Analytics | Phases 8-12 (needs real data flowing) | — |
| 17 | Super Admin surface (beyond approval) | Phase 5 + whatever it needs to moderate | — |
| 18 | Security hardening pass | Continuous, plus a dedicated pass here | — |
| 19 | Testing completeness pass | Continuous, plus a dedicated pass here | — |
| 20 | Deployment & documentation finalization | All | — |

**Key dependency insight:** Phases 3-4 (database + auth/RBAC) are the hard blocking bottleneck — almost nothing else can meaningfully start until the `User`/`Organization`/`Role`/`Permission` foundation and the guard system exist, because every other module's endpoints need `@RequirePermission` + `@RequireTenant` to even be written correctly. **Recommendation: put your two strongest/most experienced developers on Phases 3-4 and have them treat it as the top priority of the whole project**, while the rest of the team works on non-blocked work (design system, static pages, further requirement detail for later phases, seed data planning) in parallel.

## 2. Feature Dependency Map (module-level)

```
Users ─┬─> Auth ─┬─> RBAC ─┬─> Organizations ─┬─> Jobs ────────┬─> Applications ─┬─> Pipeline
       │         │         │                  │                │                 │
       │         │         │                  └─> Candidates ──┘                 │
       │         │         │                                                     ▼
       │         │         └─> Admin (Super Admin)                          Interviews ─> Evaluations
       │         │                                                                              │
       │         └─> Notifications (event-driven, scaffolds early)                              ▼
       │                                                                                  Hiring & Offers
       └─> TalentPools/Universities (needs Organizations only)                                   │
                                                                                                   ▼
       Subscriptions ─> Payments (needs Organizations only)                          Onboarding & Documents

       Analytics (reads from everything — build last)
       AuditLogs (event-driven, scaffolds early alongside Notifications)
```

## 3. Team Responsibility Mapping (5 developers, full-stack ownership per module cluster)

| Developer | Owns (backend + corresponding frontend) | Rationale |
|---|---|---|
| **Dev 1** | Auth, Users, RBAC, Notifications (scaffolding) | Foundation-critical — needs the strongest grasp of security/guards; everyone else's work depends on this being right and stable early. |
| **Dev 2** | Organizations, Admin/Super Admin portal, Subscriptions, Payments | Naturally grouped: all platform/tenant-lifecycle concerns, relatively independent of the recruitment pipeline. |
| **Dev 3** | Jobs, Candidates, Applications | The "job discovery → application" half of the lifecycle; depends on Dev 1's auth/RBAC being usable. |
| **Dev 4** | Recruitment Pipeline, Interviews, Evaluations | The "screening → interview" half; depends on Dev 3's Jobs/Applications existing. |
| **Dev 5** | Hiring & Offers, Onboarding & Documents, Talent Pools, Universities | The "decision → onboarding" tail, plus the lower-coupling sourcing features that can be picked up whenever there's slack. |

**Shared/rotating responsibilities (not owned by one person):**
- **Design system / shared UI components** — built collaboratively in Phase 2/4 (before feature portals need them), then any developer can extend it as their module needs a new primitive; changes to shared components go through a quick review from whoever else is using them that week to avoid silent breaking changes.
- **Analytics & Audit Logs** — thin modules that read from everyone else's data; best done by whoever has bandwidth in Phase 16-17, with a short handoff conversation about what events/fields already exist.
- **CI/CD & deployment (Phase 2, 20)** — one developer drives setup, but the whole team should understand and be able to modify the pipeline (mentoring goal, not just delegation).

## 4. Avoiding Conflicting/Duplicate Work

Before any developer starts a feature: check this document's dependency map, check whether another developer's module already defines a shared type/DTO/event they should reuse, and post in the team channel which files/modules they're starting (a lightweight verbal/async "claim," not tooling-enforced). Because module boundaries in `architecture.md` §2 are deliberately strict (a module never reaches into another's Prisma models directly, only its service layer), two developers working in different modules should almost never touch the same file — if a PR touches files across two developers' owned modules, that's a signal to pair or at least review together before merging.

## 5. Task Template (use for every ticket)

| Field | Content |
|---|---|
| Task ID | `<MODULE>-<NNN>`, e.g. `JOB-003` |
| Developer | Assigned owner |
| Description | One or two sentences, referencing the `REQ-*` ID(s) from `requirements.md` it implements |
| Dependencies | Other Task IDs / phases that must land first |
| Acceptance criteria | Bullet list tied to the Definition of Done (requirement, UI, API, DB, validation, auth, tenant security, error handling, tests, docs) |
| Expected files/modules | So reviewers know the expected blast radius |
| Testing requirements | Which cases from `testing.md` §2 apply |

## 6. Git Workflow

- **Branches:** `main` (always deployable/demo-ready), `develop` (integration branch), `feature/<module>-<short-desc>`, `bugfix/...`, `hotfix/...`.
- **Flow per feature:** `requirement confirmed → branch from develop → implement (with tests) → self-review against Definition of Done → open PR into develop → CI must pass → at least one teammate review → merge → periodically merge develop into main at stable checkpoints (e.g., end of each phase)`.
- **Commits:** small, scoped, conventional-style (`feat: add candidate registration`, `fix: prevent cross-tenant application access`, `test: add tenant-isolation cases for jobs module`, `docs: update api.md for offers endpoints`). No unrelated changes bundled into one commit.
- **PR size:** prefer small PRs scoped to one endpoint/feature over one giant "implement Applications module" PR — easier to review, easier to bisect if something breaks.
- **Code review:** every PR reviewed by at least one other developer before merge, using the checklist in `security.md` §13 and the multi-tenancy checklist in `multi-tenancy.md` §7 for anything touching tenant data.

## 7. Recommended MVP Scope

To have a demoable product within a semester, the recommended MVP cuts (deferring, not deleting, the rest) is:

**In MVP:** Auth, RBAC (seeded roles only, no custom org roles), Organizations (registration + Super Admin approval), Jobs (full lifecycle), Candidates (profile + CV), Applications (submit/screen/shortlist), Recruitment Pipeline (basic stage movement, one default template), Interviews (scheduling + panel), Evaluations (structured score + comment + recommendation), Hiring decisions, Offers (create/send/accept/decline), basic Notifications (email on key events), basic Audit Log.

**Deferred to post-MVP (P2 in `requirements.md`):** Talent Pools, University Partnerships, Subscriptions/Payments (or stubbed with a single free plan and no real Stripe flow until time allows), Analytics dashboards (beyond simple counts), org-custom roles, AI features (always deferred, see ADR-005).

This scope keeps every phase in the dependency map's critical path (3→4→5→7→8→9→10→11) inside MVP, and pushes the lower-coupling side branches (13, 15, 16) to "if time allows," which is exactly the sequencing a 5-person student team needs to guarantee *something end-to-end works* before spending time on breadth.
