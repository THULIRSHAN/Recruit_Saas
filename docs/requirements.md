# Software Requirements Specification (SRS)
## Applicant Tracking & Recruitment Management SaaS Platform

Status: DRAFT v1.0 — for team review and confirmation before Phase 2 begins.
Owner: Engineering team (5 developers) · Reviewed by: Senior Architect (this document)

---

## 1. System Overview

The platform is a **multi-tenant B2B SaaS product** that lets recruiting organizations (companies, agencies, university career centers) manage the full recruitment lifecycle, and lets candidates discover and apply to jobs across those organizations.

Core lifecycle modeled by the system:

Job Discovery → Job Application → CV Screening → Shortlisting → Recruitment Pipeline → Interview → Evaluation → Hiring Decision → Employment Offer → Document Collection → Onboarding.

Two audiences share one platform:

- **Candidate side** — public job search, application, tracking application status, document upload, offer acceptance.
- **Organization side** — a tenant workspace where a company's recruiters, hiring managers, interviewers and HR manage jobs, pipelines and hiring.

A third, platform-level layer (Super Admin) operates above all tenants: approving new organizations, managing subscriptions/billing, and monitoring the platform.

AI features (CV screening, matching, recommendations) are explicitly **out of scope for the MVP** and are listed only as future extension points (see `decisions/ADR-005-ai-features-deferred.md`). No module should be designed in a way that blocks adding them later (e.g., an `Application` should have room for a future `matchScore` field), but none should be built now.

---

## 2. Actors

| Actor | Scope | Summary |
|---|---|---|
| **Candidate** | Platform-wide (not tied to one org) | Searches jobs, applies, manages profile/CV, tracks applications, accepts offers, uploads onboarding documents. |
| **Company Owner** | Organization | Owns the org's subscription/billing, manages org settings, invites/removes staff, has full visibility into the org's data. First user of a newly approved organization. |
| **Recruiter** | Organization | Creates/edits jobs, screens applications, manages the recruitment pipeline, schedules interviews. |
| **Hiring Manager** | Organization | Requests roles, reviews shortlisted/interviewed candidates for their team, approves/rejects hiring decisions for their req. |
| **Interviewer** | Organization | Sees only interviews/candidates assigned to them, submits evaluations. |
| **HR Manager** | Organization | Manages offers, document collection, onboarding; may have elevated visibility across the org's pipelines. |
| **Super Administrator** | Platform | Approves/rejects organization signups, manages platform users, monitors subscriptions & payments, platform-wide analytics, moderation, audit log access. |

**UNCLEAR REQUIREMENT — Actor overlap.** The brief lists Hiring Manager and Recruiter as distinct actors but does not specify whether one user can hold both roles simultaneously within an org, or whether a small organization (e.g., a 10-person startup) is expected to collapse these into one person wearing multiple hats. Recommendation: allow a user to hold **multiple roles within the same organization** (many-to-many `UserOrganizationRole`), so small orgs aren't forced to create fake accounts. Needs team confirmation — see `open-questions.md` Q1.

---

## 3. Functional Requirements

Requirement ID scheme: `REQ-<MODULE>-<NNN>`. Priority: **P0** = MVP-blocking, **P1** = MVP-important, **P2** = post-MVP.

### 3.1 Requirements index (all modules)

| ID | Description | Actor(s) | Priority |
|---|---|---|---|
| REQ-AUTH-001 | User registration (candidate) | Candidate | P0 |
| REQ-AUTH-002 | Organization registration (creates org + Company Owner account) | Company Owner | P0 |
| REQ-AUTH-003 | Super Admin approval of new organizations | Super Admin | P0 |
| REQ-AUTH-004 | Login (email + password) | All | P0 |
| REQ-AUTH-005 | Token refresh | All | P0 |
| REQ-AUTH-006 | Logout / token revocation | All | P0 |
| REQ-AUTH-007 | Password reset via email | All | P1 |
| REQ-AUTH-008 | Staff invitation (org invites a user by email into a role) | Company Owner, HR Manager | P0 |
| REQ-RBAC-001 | Role & permission management within an org | Company Owner | P1 |
| REQ-JOB-001 | Job creation (draft) | Recruiter, Hiring Manager | P0 |
| REQ-JOB-002 | Job publishing | Recruiter | P0 |
| REQ-JOB-003 | Job editing | Recruiter | P0 |
| REQ-JOB-004 | Job closing / archiving | Recruiter | P0 |
| REQ-JOB-005 | Public job search & filtering | Candidate (incl. anonymous) | P0 |
| REQ-CAND-001 | Candidate profile creation/editing | Candidate | P0 |
| REQ-CAND-002 | CV upload (file) | Candidate | P0 |
| REQ-CAND-003 | Education/experience/skills entries | Candidate | P1 |
| REQ-APP-001 | Job application submission | Candidate | P0 |
| REQ-APP-002 | Application screening (recruiter reviews) | Recruiter | P0 |
| REQ-APP-003 | Candidate shortlisting | Recruiter | P0 |
| REQ-APP-004 | Application withdrawal | Candidate | P1 |
| REQ-PIPE-001 | Recruitment pipeline stage definition per job | Recruiter | P0 |
| REQ-PIPE-002 | Move candidate between pipeline stages | Recruiter, Hiring Manager | P0 |
| REQ-INT-001 | Interview scheduling | Recruiter | P0 |
| REQ-INT-002 | Interview panel assignment | Recruiter | P0 |
| REQ-INT-003 | Interviewer views assigned interviews only | Interviewer | P0 |
| REQ-EVAL-001 | Interview evaluation submission | Interviewer | P0 |
| REQ-EVAL-002 | Aggregate evaluation view for decision-making | Recruiter, Hiring Manager | P1 |
| REQ-HIRE-001 | Hiring decision (accept/reject candidate) | Hiring Manager | P0 |
| REQ-OFFER-001 | Employment offer creation & send | HR Manager | P0 |
| REQ-OFFER-002 | Offer acceptance/decline (candidate) | Candidate | P0 |
| REQ-DOC-001 | Onboarding document request | HR Manager | P1 |
| REQ-DOC-002 | Document upload (candidate) | Candidate | P1 |
| REQ-ONB-001 | Onboarding checklist/status tracking | HR Manager | P1 |
| REQ-POOL-001 | Talent pool creation & candidate tagging | Recruiter | P2 |
| REQ-UNI-001 | University partnership management | Super Admin, Company Owner | P2 |
| REQ-SUB-001 | Subscription plan selection | Company Owner | P1 |
| REQ-PAY-001 | Payment via Stripe (test mode) | Company Owner | P1 |
| REQ-NOTIF-001 | Email/in-app notifications on key events | System → All | P1 |
| REQ-ANALYTICS-001 | Org-level recruitment analytics dashboard | Recruiter, Hiring Manager, Company Owner | P2 |
| REQ-ANALYTICS-002 | Platform-level analytics | Super Admin | P2 |
| REQ-AUDIT-001 | Audit log of sensitive actions | System → Super Admin | P1 |

### 3.2 Detailed specifications — MVP-critical requirements (P0)

Full detail is given here for the requirements that gate every later phase. The remaining P1/P2 requirements will receive this same level of detail immediately before their implementation phase begins (Phase 11 onward), per the "just-in-time elaboration" note in `open-questions.md`.

---

#### REQ-AUTH-001 — Candidate Registration

- **Actor:** Candidate
- **Preconditions:** User is not already registered with the given email.
- **Main flow:** User submits name, email, password → system validates → password hashed (bcrypt/argon2) → `User` row created with role `CANDIDATE`, `emailVerified=false` → verification email sent → user redirected to "check your email".
- **Alternative flows:** Email already exists → 409 Conflict with generic "account may already exist" message (do not leak which field failed, to avoid user enumeration — see `security.md`). Weak password → 400 with validation detail.
- **Business rules:** Password ≥ 8 chars, at least 1 letter + 1 number (tune with team). Email must be verified before applying to jobs (configurable — see open question Q2).
- **Expected result:** `User` created, verification email queued.
- **Priority:** P0

#### REQ-AUTH-002 — Organization Registration

- **Actor:** prospective Company Owner
- **Preconditions:** None (public signup).
- **Main flow:** Submits org name, org email, admin user details → system creates `Organization` (status `PENDING_APPROVAL`) and `User` (role `COMPANY_OWNER`) in one transaction → confirmation email sent → org is **not usable** (cannot post jobs, cannot log in to org portal beyond a "pending approval" screen) until Super Admin approves.
- **Business rules:** Org name should be unique-ish (not strictly enforced, but flagged if a close match exists, to catch duplicate signups). One org per registration; the registering user always becomes `COMPANY_OWNER`.
- **Expected result:** `Organization(status=PENDING_APPROVAL)`, owner `User` created, notification queued to Super Admin.
- **Priority:** P0

#### REQ-AUTH-003 — Super Admin Organization Approval

- **Actor:** Super Admin
- **Preconditions:** Organization exists with `status=PENDING_APPROVAL`.
- **Main flow:** Super Admin reviews org details → approves → `status=ACTIVE`, activation email sent to Company Owner → org can now be used.
- **Alternative flow:** Rejects with a reason → `status=REJECTED`, rejection email sent with reason. Rejected orgs cannot re-register with the same email without Super Admin intervention (prevents spam re-signup loops).
- **Business rules:** Only `SUPER_ADMIN` role can call this. Action is written to `AuditLog`.
- **Expected result:** Organization becomes usable or is closed out.
- **Priority:** P0

#### REQ-AUTH-004/005/006 — Login, Refresh, Logout

- **Main flow (login):** email + password → verify hash → issue short-lived **access token** (JWT, ~15 min) + long-lived **refresh token** (opaque or JWT, ~7–30 days, stored hashed in DB, rotated on use) → access token carries `sub` (userId), `orgId` (null for candidates), `roles[]`.
- **Refresh:** client presents refresh token → validated against DB (not revoked, not expired) → old refresh token invalidated, new pair issued (**rotation** — prevents replay).
- **Logout:** refresh token is revoked server-side (deleted/blacklisted). Access tokens are short-lived enough that we accept they remain valid until natural expiry (documented trade-off).
- **Business rules:** Failed login attempts rate-limited per IP+email (see `security.md`). See `authentication.md` for full design.
- **Priority:** P0

#### REQ-AUTH-008 — Staff Invitation

- **Actor:** Company Owner, HR Manager (if granted `user:invite` permission)
- **Main flow:** Inviter enters email + role(s) → system creates a pending invitation (token, expiry 7 days) → email sent → invitee clicks link → if new user, sets password and account is created pre-bound to the org+role; if existing user, the role is attached to their account for that org.
- **Business rules:** Cannot invite into an org that is not `ACTIVE`. Invitation tokens are single-use.
- **UNCLEAR REQUIREMENT:** Can an existing Candidate account be "promoted" to also be a Recruiter at an org (same login, dual capability), or must staff accounts be separate from candidate accounts entirely? Recommendation: same `User` row, org-scoped roles — a person can be a candidate on the public side and staff at their employer's org with one login. Needs confirmation — `open-questions.md` Q3.
- **Priority:** P0

#### REQ-JOB-001..004 — Job Lifecycle

- **States:** `DRAFT → PUBLISHED → CLOSED` (and `ARCHIVED` as a terminal soft-delete state).
- **Create (DRAFT):** Recruiter/Hiring Manager fills title, description, department, location, employment type, salary range (optional), pipeline template. Tenant-scoped to their org.
- **Publish:** DRAFT → PUBLISHED. Business rule: a job must have at least one recruitment stage defined (REQ-PIPE-001) before it can publish. Published jobs appear in public search.
- **Edit:** allowed in any state, but editing a PUBLISHED job's core fields (title, requirements) after applications exist should be flagged in the UI (candidates already applied to the old version) — logged, not blocked.
- **Close:** PUBLISHED → CLOSED. Closed jobs stop accepting applications but remain visible for record-keeping; removed from public search results.
- **Priority:** P0

#### REQ-JOB-005 — Public Job Search

- **Actor:** Candidate, anonymous visitor
- **Main flow:** Visitor searches/filters by keyword, location, employment type, org → paginated results of `PUBLISHED` jobs only, across **all active organizations** (this is the public marketplace aspect of the platform).
- **Business rules:** Only jobs belonging to `ACTIVE` organizations and in `PUBLISHED` state are ever returned; this is enforced at the query level, not just the UI.
- **Priority:** P0

#### REQ-CAND-001/002 — Candidate Profile & CV

- **Main flow:** Candidate maintains a profile (headline, location, contact) and uploads one or more CVs (PDF/DOCX, size-limited — see `security.md` §File Upload). One CV can be marked "primary" and reused across applications; a candidate may attach a different CV per application.
- **Business rules:** CV files are stored in **private** object storage; access is via signed, time-limited URLs, and only to: the candidate themself, recruiters/hiring managers/interviewers at an org the candidate has applied to (and only for that application's org — tenant isolation applies to file access too).
- **Priority:** P0

#### REQ-APP-001 — Job Application Submission

- **Actor:** Candidate
- **Preconditions:** Job is `PUBLISHED`; candidate has a profile and at least one CV attached (or attaches one during application).
- **Main flow:** Candidate → Job Details page → Apply → selects/uploads CV, optional cover note → `Application` created with `stage = <pipeline's first stage>` (e.g., "Applied") → notification to org's recruiters → candidate's dashboard shows the new application.
- **Business rules:** **A candidate may not submit more than one active (non-withdrawn) application to the same job.** Applying does not require email verification to be strictly enforced for MVP unless the team decides otherwise (open question Q2).
- **Expected result:** `Application` row created, linked to `Candidate`, `Job`, and (denormalized) `Organization` for tenant filtering.
- **Priority:** P0

#### REQ-APP-002/003 — Screening & Shortlisting

- **Actor:** Recruiter
- **Main flow:** Recruiter reviews incoming applications for a job (list + CV preview) → marks as `Screened` (pass/reject with optional reason) → passing candidates are moved into `Shortlisted` stage of the pipeline.
- **Business rules:** Rejecting at this stage should optionally trigger a candidate-facing rejection notification (configurable per org — some orgs prefer silent rejection; flagged as open question Q4).
- **Priority:** P0

#### REQ-PIPE-001/002 — Recruitment Pipeline

- **Model:** Each job has an ordered list of `RecruitmentStage`s (e.g., Applied → Screening → Shortlisted → Interview → Offer → Hired, plus a parallel `Rejected` terminal stage reachable from any stage). Orgs can define a **reusable pipeline template** and apply it to new jobs, or customize per job.
- **Main flow:** Recruiter/Hiring Manager drags or moves an `Application` from one stage to the next → stage transition is recorded with timestamp + actor (for audit/analytics) → triggers relevant notification.
- **Business rules:** Stage transitions are **not required to be strictly linear** (a recruiter can move a candidate back, or reject from any stage) but every transition is logged.
- **Priority:** P0

#### REQ-INT-001/002/003 — Interviews

- **Main flow:** Recruiter schedules an `Interview` for an `Application` at a pipeline stage → sets date/time, mode (onsite/video/phone), assigns one or more `Interviewer`s (panel) → interviewers are notified → each interviewer sees **only** interviews/candidates they are assigned to (enforced in the query layer, not just UI — REQ-INT-003).
- **Business rules:** An interviewer must belong to the same organization as the job. Rescheduling keeps history (do not hard-delete the old slot; mark `RESCHEDULED` and link to the new one).
- **Priority:** P0

#### REQ-EVAL-001 — Evaluation Submission

- **Actor:** Interviewer
- **UNCLEAR REQUIREMENT:** Numeric scoring vs. qualitative feedback vs. both. Recommendation: support **both** — a structured numeric score (1–5) per a small set of org-configurable competencies, plus a free-text comment and an overall recommendation (`STRONG_YES / YES / NO / STRONG_NO`). This is the industry-standard pattern (e.g., Google's hiring committee model) and is flexible enough for any org's process. Needs confirmation — `open-questions.md` Q5, since it affects the `Evaluation` schema.
- **Main flow:** After an interview, the assigned interviewer submits scores/comments/recommendation → visible to Recruiter/Hiring Manager (never to other interviewers on the same panel, to avoid anchoring bias, until all have submitted — configurable) and never to the candidate.
- **Priority:** P0

#### REQ-HIRE-001 — Hiring Decision

- **Actor:** Hiring Manager (or Recruiter, org-configurable — see Q6)
- **Main flow:** After reviewing aggregated evaluations, Hiring Manager marks the application `Hired` or `Rejected` at the final stage → triggers offer workflow (if hired) or rejection notification.
- **Priority:** P0

#### REQ-OFFER-001/002 — Offer

- **Main flow:** HR Manager creates an `Offer` (title, compensation, start date, expiry date, optional offer letter document) linked to the hired `Application` → sends to candidate → candidate accepts/declines within the expiry window → on accept, `Application.stage = Hired`/`OfferAccepted`, onboarding is triggered; on decline, recruiter is notified and can reopen the pipeline.
- **Priority:** P0

#### REQ-DOC-001/002, REQ-ONB-001 — Onboarding Documents & Checklist

- **Actors:** HR Manager (REQ-DOC-001, REQ-ONB-001), Candidate (REQ-DOC-002).
- **Main flow:** Once a candidate accepts an `Offer` (REQ-OFFER-002), HR Manager starts onboarding by creating an `OnboardingChecklist` with an initial set of `OnboardingTask`s (each representing a requested document, e.g. "Submit ID proof") — a deliberate HR Manager action, not automatic, gated on the offer being `ACCEPTED`. HR Manager can add further tasks later (a document "request") as the process continues. The candidate views their checklist and uploads a `Document` against each task (private storage, same signed-URL pattern as CV upload, REQ-CAND-002/`security.md` §11) — multiple documents per task are allowed (e.g. front/back of an ID). HR Manager reviews an uploaded document and explicitly marks the task complete; a task does not auto-complete on upload, since REQ-ONB-001 names status *tracking* as an HR Manager capability, and an unreviewed upload could be wrong or incomplete.
- **Business rules:** A task can only belong to one checklist, and a checklist to one `Offer` (`@@unique` in the schema). Documents are always privately stored; only the uploading candidate and HR Manager at the same org may access one (see `multi-tenancy.md` §3, `security.md` §11).
- **Priority:** P1

*(REQ-POOL, REQ-UNI, REQ-SUB, REQ-PAY, REQ-NOTIF, REQ-ANALYTICS, REQ-AUDIT are indexed in §3.1 above; full detail will be produced at the start of their respective implementation phase per the team's phased plan in `team-plan.md`, so specification effort isn't sunk into features that may shift before we reach them.)*

---

## 4. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Security** | All endpoints authenticated by default (opt-out, not opt-in); tenant isolation enforced server-side on every org-scoped query; passwords hashed with bcrypt/argon2; secrets never in source control. |
| **Multi-tenancy** | Zero cross-tenant data leakage, verified by automated tests (see `testing.md`) on every org-scoped endpoint. |
| **Availability** | Target 99.5% uptime for MVP (student project — documented as aspirational, not contractually binding). |
| **Performance** | P95 API response time < 500ms for standard CRUD; job search < 1s for typical result sets with pagination. |
| **Scalability** | Modular monolith must allow a module to be extracted into a service later without a full rewrite (enforced via module boundaries — see `architecture.md`). |
| **Usability** | Distinct, role-appropriate portals; no dead ends (empty/loading/error states everywhere — see `frontend-architecture.md`). |
| **Maintainability** | Consistent patterns (DTOs, services, guards); no business logic in controllers or UI components. |
| **Auditability** | Sensitive actions (approvals, role changes, hiring decisions, payments) are immutably logged with actor, timestamp, and before/after where relevant. |
| **Data privacy** | Candidate PII and documents are only visible to orgs the candidate has actively applied to; Super Admin does not casually browse tenant business data (documented access policy, not just capability). |
| **Compliance-readiness** | Design should not preclude future GDPR-style "right to be forgotten" (soft-delete + anonymization path), even though full compliance is out of scope for MVP. |

---

## 5. Use Cases & Major Business Workflows

See `architecture.md` §"User Journeys" for the User → Page → Action → API → DB → Result traces per major feature (job posting, application, interview, hiring, offer), as required by the working-process brief. Keeping journeys in the architecture doc avoids duplicating the same flow twice across files.

---

## 6. Open Items

All `UNCLEAR REQUIREMENT` markers above are consolidated with recommendations in `open-questions.md`. Do not begin implementing the affected features until the team has confirmed or overridden each recommendation.
