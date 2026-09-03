# Open Questions & Ambiguous Requirements

Status: **RESOLVED 2026-09-03** — all ten items below accepted as the stated recommendation, confirmed by the project owner in lieu of a full team meeting. Kept as the running log per the "How to Resolve These" section; revisit any individual item if it turns out wrong once the relevant phase is actually built.

| # | Question | Where it matters | Decided |
|---|---|---|---|
| **Q1** | Can one user hold multiple roles at the same organization (e.g., Recruiter + Hiring Manager)? | `authorization.md`, `database.md` (`UserOrganizationRole`) | **Decided:** Yes — allow multiple roles per user per org via the many-to-many join table already modeled. |
| **Q2** | Must a candidate verify their email before applying to jobs? | REQ-AUTH-001, REQ-APP-001, `authentication.md` §3 | **Decided:** Not gated on verification for MVP; verification is required before offer acceptance. |
| **Q3** | Is a "staff" account (Recruiter, HR, etc.) the same `User` login as a candidate account, or must they be separate identities? | REQ-AUTH-008, `database.md` (`User`/`UserOrganizationRole`) | **Decided:** Same identity — one login, org-scoped roles determine capability. |
| **Q4** | When a recruiter rejects a candidate at screening, is the candidate notified automatically, silently, or is it org-configurable? | REQ-APP-002/003, `Notifications` module | **Decided:** Org-configurable, per-org boolean setting, default ON. |
| **Q5** | Is interview evaluation numeric scoring, qualitative feedback, or both? | REQ-EVAL-001, `database.md` (`Evaluation.scores`, `.comment`, `.recommendation`) | **Decided:** Both — structured per-competency score (1-5) + free text + an overall recommendation enum. |
| **Q6** | Who makes the final hiring decision — Hiring Manager only, or also Recruiter? | REQ-HIRE-001, `authorization.md` §3 | **Decided:** Hiring Manager is the primary decision-maker; Recruiter can propose/advance to the decision stage but not finalize. |
| **Q7** | If a candidate updates their "primary" CV after applying somewhere, should past applications keep showing the CV version as it was at application time, or always the candidate's current CV? | `database.md` §3 | **Decided:** Snapshot-at-application-time via `Application.cvId`. |
| **Q8** | File storage: AWS S3 or Cloudinary? | `decisions/ADR-004-file-storage-provider.md`, `deployment.md` §4 | **Decided:** Cloudinary for MVP. |
| **Q9** | Frontend hosting: Vercel vs. containerized alongside backend? | `deployment.md` §4 | **Decided:** Containerized alongside the backend via the dev/prod Docker Compose stack (consistent with `deployment.md` §2's docker-compose design); revisit if a hosting constraint later favors Vercel. |
| **Q10** | Is Subscriptions/Payments in scope for the MVP demo, or can it be stubbed (single free plan, no real Stripe checkout flow) until later? | `team-plan.md` §7 (MVP scope) | **Decided:** Stubbed for MVP — single free plan, no real Stripe checkout flow until M14. |

## Risks (separate from the above — things to watch, not decisions to make now)

- **Bottleneck risk:** Phases 3-4 (database + auth/RBAC) block nearly everything else. If those slip, the whole team stalls. Mitigation: assign the strongest available developers there and treat it as the first priority, per `team-plan.md` §1.
- **Tenant-isolation regression risk:** with 5 developers of varying experience touching tenant-owned data, a single missed `organizationId` filter is a critical security bug that's easy to introduce and easy to miss in casual review. Mitigation: the `TenantScopedService` base pattern (`multi-tenancy.md` §4) plus the mandatory cross-tenant test case (`testing.md` §2 case 5) as a hard PR gate.
- **Scope risk:** the full feature list (25 functional areas) is large for a semester team of 5. Mitigation: the MVP scope cut in `team-plan.md` §7 exists specifically to protect a working end-to-end demo over broad-but-shallow coverage.
- **Knowledge-silo risk:** module ownership (`team-plan.md` §3) reduces conflicts but risks each developer only understanding their own slice. Mitigation: code review across owners (not just within a module), and this documentation set existing so anyone can ramp on any module.
- **"It works on my machine" risk:** without the Docker/CI setup in Phase 2 being solid early, integration surprises pile up late. Mitigation: prioritize Phase 2 completeness (docker-compose, CI skeleton) before feature work fans out.

## How to Resolve These

Bring this list to a team meeting, decide (override the recommendation if the team disagrees — these are informed defaults, not mandates), and record the decision by editing this file directly (replace "Recommendation" with "**Decided:**" and the chosen answer) — keep the table as the running log of these calls so no one re-litigates a settled question mid-semester.
