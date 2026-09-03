# User Stories

Status: DRAFT v1.0 — companion to `requirements.md` (which defines the system-level `REQ-*` behavior) and `business-analysis.md` (which defines the business-level `BR-*` rationale). This document translates both into concrete, step-by-step stories written from each actor's point of view, in the order they actually happen. Where a story has a screen already built in the clickable prototype, it's named so you can click through it while you read.

Format for every story: **As a / I want to / so that**, then **preconditions**, then a **numbered step-by-step flow**, then **acceptance criteria** (what must be true for the story to count as done), then **traceability** back to the SRS and business requirements.

Priority uses the same scale as `requirements.md`: **P0** = MVP-blocking, **P1** = MVP-important, **P2** = post-MVP.

---

## Index

| ID | Story | Actor | Priority | Screen(s) |
|---|---|---|---|---|
| US-C-01 | Search and browse jobs | Candidate / Visitor | P0 | Job Marketplace |
| US-C-02 | View job details | Candidate / Visitor | P0 | Job Details |
| US-C-03 | Create a candidate account | Candidate | P0 | Candidate Sign Up |
| US-C-04 | Log in | Any user | P0 | Log In |
| US-C-05 | Build a profile and upload a CV | Candidate | P0 | My Profile |
| US-C-06 | Apply to a job | Candidate | P0 | Apply to a Job |
| US-C-07 | Track application status | Candidate | P0 | Dashboard, Application Tracker |
| US-C-08 | Withdraw an application | Candidate | P1 | Application Tracker |
| US-C-09 | Receive and respond to an offer | Candidate | P0 | Offer Review |
| US-C-10 | Upload onboarding documents | Candidate | P1 | *(not yet built)* |
| US-O-01 | Register a new organization | Company Owner | P0 | Organization Sign Up |
| US-O-02 | Invite a staff member | Company Owner / HR Manager | P0 | *(not yet built)* |
| US-R-01 | Post a new job | Recruiter | P0 | Job Editor |
| US-R-02 | Define the recruitment pipeline | Recruiter | P0 | Job Editor |
| US-R-03 | Publish or close a job | Recruiter | P0 | Job Editor, Org Dashboard |
| US-R-04 | Screen incoming applications | Recruiter | P0 | Pipeline Board, Org Dashboard |
| US-R-05 | Shortlist a candidate | Recruiter | P0 | Pipeline Board |
| US-R-06 | Schedule an interview | Recruiter | P0 | Schedule Interview |
| US-R-07 | Move a candidate through pipeline stages | Recruiter / Hiring Manager | P0 | Pipeline Board, Application Detail |
| US-I-01 | View my assigned interviews | Interviewer | P0 | Interviewer Evaluation |
| US-I-02 | Submit an interview evaluation | Interviewer | P0 | Interviewer Evaluation |
| US-H-01 | Review evaluations and make a hiring decision | Hiring Manager | P0 | Application Detail |
| US-HR-01 | Create and send an offer | HR Manager | P0 | Offer Create |
| US-HR-02 | Track offer status | HR Manager | P1 | *(not yet built)* |
| US-HR-03 | Request and track onboarding documents | HR Manager | P1 | *(not yet built)* |
| US-A-01 | Approve or reject a new organization | Super Admin | P0 | Org Approval Queue |
| US-A-02 | Monitor platform health and audit log | Super Admin | P1 | Platform Overview |

---

## Candidate stories

### US-C-01 — Search and browse jobs

**As a** candidate or anonymous visitor
**I want to** search and filter open jobs across every organization on the platform
**So that** I can find roles relevant to me without having to create an account first

**Priority:** P0 &middot; **Traces to:** REQ-JOB-005, BR-003

**Preconditions:** None. No login required.

**Steps:**
1. Visitor opens the Hirelane job marketplace.
2. Visitor types a keyword (e.g. "Product Designer") into the search box and, optionally, a location.
3. Visitor narrows results with the filter sidebar (employment type, experience level, salary range).
4. Visitor clicks **Search**.
5. The system returns a paginated list of jobs.
6. Visitor clicks a job card to open its full details.

**Acceptance criteria:**
- Only jobs with status `Published`, belonging to organizations with status `Active`, ever appear — enforced server-side, not just hidden in the UI.
- Filters and search terms combine (AND, not OR) and update the result list without a full page reload.
- No step in this story requires authentication.

---

### US-C-02 — View job details

**As a** candidate or anonymous visitor
**I want to** read the full description, responsibilities, requirements, and organization info for a job
**So that** I can decide whether it's worth applying to

**Priority:** P0 &middot; **Traces to:** REQ-JOB-005

**Preconditions:** A published job exists.

**Steps:**
1. Visitor arrives at Job Details (from search, or a direct link).
2. Visitor reads the role summary (title, org, location, employment type, compensation range, posted date).
3. Visitor reads "What you'll do" and "What we're looking for."
4. Visitor reads the "About [Organization]" section and can click through to see the org's other open roles.
5. Visitor clicks **Apply now**.

**Acceptance criteria:**
- If the job is not `Published` (closed, draft, or belongs to a non-active org), this page returns a 404-equivalent "not found" state rather than showing stale data.
- The **Apply now** action requires the visitor to be logged in as a candidate — if not, they're routed to log in or create an account first, then returned to this job.

---

### US-C-03 — Create a candidate account

**As a** job seeker without an account
**I want to** register with my name, email, and a password
**So that** I can apply to jobs and track my applications in one place

**Priority:** P0 &middot; **Traces to:** REQ-AUTH-001

**Preconditions:** The email address is not already registered.

**Steps:**
1. Visitor clicks **Create a candidate account** (from Log In, or from the Apply flow).
2. Visitor enters full name, email, password, and confirms the password.
3. Visitor checks "I agree to the Terms of Service and Privacy Policy."
4. Visitor clicks **Create account**.
5. System validates the input, hashes the password, and creates the account.
6. System sends a verification email.
7. Visitor lands on their (mostly empty) Dashboard.

**Acceptance criteria:**
- Duplicate email returns a generic "account may already exist" message — never confirms or denies a specific email is registered (prevents account enumeration).
- Password must meet the minimum policy (&ge; 8 characters, at least one letter and one number).
- Whether email verification blocks applying is an open decision — see `open-questions.md` Q2; until resolved, this story assumes it does **not** block applying.

---

### US-C-04 — Log in

**As a** returning user (candidate or staff)
**I want to** log in with my email and password
**So that** I can access my account

**Priority:** P0 &middot; **Traces to:** REQ-AUTH-004

**Preconditions:** An account exists.

**Steps:**
1. User opens Log In.
2. User enters email and password.
3. User clicks **Log in**.
4. System verifies credentials, issues an access token and a refresh token.
5. User is redirected to the dashboard appropriate to their role (candidate dashboard, org dashboard, or admin overview).

**Acceptance criteria:**
- Wrong password or unknown email returns the same generic error message (no enumeration).
- Failed attempts are rate-limited per IP + email pair.
- A user who belongs to more than one organization is prompted to choose which one to work in (see `authentication.md` §5) before landing on the org dashboard.

---

### US-C-05 — Build a profile and upload a CV

**As a** candidate
**I want to** maintain a profile with my experience, education, skills, and CV
**So that** I don't have to re-enter this information for every application

**Priority:** P0 &middot; **Traces to:** REQ-CAND-001, REQ-CAND-002, REQ-CAND-003

**Preconditions:** Candidate is logged in.

**Steps:**
1. Candidate opens **My Profile**.
2. Candidate clicks **Upload new CV**, selects a PDF/DOCX file.
3. System validates file type and size, stores it privately, and lists it under "Resume / CV."
4. Candidate marks one CV as "Primary" (used by default on future applications).
5. Candidate adds an experience entry (company, title, dates, description).
6. Candidate adds an education entry.
7. Candidate adds skill tags.
8. Candidate edits their headline and location from the summary card.

**Acceptance criteria:**
- Only PDF/DOC/DOCX files under the configured size limit are accepted; rejected files show a clear reason.
- Uploaded files are never publicly reachable — only accessible via a short-lived signed URL to the candidate themself or staff with an active application from them.
- The candidate can hold more than one CV and choose which one to submit per application (see US-C-06).

---

### US-C-06 — Apply to a job

**As a** candidate
**I want to** submit an application to a job I'm interested in
**So that** I enter that organization's hiring pipeline

**Priority:** P0 &middot; **Traces to:** REQ-APP-001

**Preconditions:** Candidate is logged in, has at least one CV on file, and has not already applied to this job.

**Steps:**
1. Candidate clicks **Apply now** on Job Details.
2. Apply screen shows the job summary (title, org) and the candidate's CVs; candidate selects one (or uploads a different one).
3. Candidate writes an optional cover note.
4. Candidate confirms whether to share their full profile (experience, education, skills) with this application.
5. Candidate clicks **Submit Application**.
6. System validates the job is still `Published`, checks for a duplicate active application, and creates the `Application` at the pipeline's first stage.
7. System notifies the organization's recruiters.
8. Candidate is returned to their Dashboard, where the new application now appears.

**Acceptance criteria:**
- A candidate cannot have more than one **active** (non-withdrawn) application to the same job — a second attempt is blocked with a clear message, not a silent duplicate.
- If the job closed between viewing and submitting, the candidate sees a clear "this role is no longer accepting applications" message instead of a generic error.
- The submitted CV reference is fixed to the version at submission time (see `database.md` §3 / `open-questions.md` Q7) so a later CV edit doesn't retroactively change what the recruiter already reviewed.

---

### US-C-07 — Track application status

**As a** candidate
**I want to** see the status of every job I've applied to, and the full history of one application
**So that** I know where I stand without having to email the recruiter

**Priority:** P0 &middot; **Traces to:** REQ-APP-001 (status visibility)

**Preconditions:** Candidate has at least one application.

**Steps:**
1. Candidate opens their **Dashboard**.
2. Candidate sees a summary (active applications, interviews scheduled, offers) and a table of recent applications with a stage badge for each (Applied, Screening, Interview, Offer, Hired, Rejected).
3. Candidate clicks one application to open its **Application Tracker**.
4. Candidate sees a timeline: every stage reached, when, and a short note about what happened at that stage.
5. Candidate sees the job summary and which CV was submitted.

**Acceptance criteria:**
- The stage shown always reflects the current `RecruitmentStage` on the `Application` — never a cached or stale value.
- A candidate can only ever see their own applications — this is enforced server-side by filtering on `candidateId = current user`, the same discipline as the org-side tenant filter (see `multi-tenancy.md` §6).

---

### US-C-08 — Withdraw an application

**As a** candidate
**I want to** withdraw an application I no longer want to pursue
**So that** the organization knows not to continue considering me, and I can apply elsewhere with a clean status

**Priority:** P1 &middot; **Traces to:** REQ-APP-004

**Preconditions:** The application is active (not already hired, rejected, or withdrawn).

**Steps:**
1. Candidate opens the Application Tracker for the application.
2. Candidate clicks **Withdraw application**.
3. System asks for confirmation.
4. Candidate confirms.
5. System sets the application's status to `Withdrawn`, removes it from the org's active pipeline view, and notifies the recruiter.

**Acceptance criteria:**
- A withdrawn application cannot be un-withdrawn by the candidate (a fresh application would be a new submission, subject to the one-active-application rule in US-C-06).
- The organization still retains the historical record for audit purposes; it isn't deleted.

---

### US-C-09 — Receive and respond to an offer

**As a** candidate
**I want to** review an offer's terms and accept or decline it
**So that** I can formally confirm (or decline) the job

**Priority:** P0 &middot; **Traces to:** REQ-OFFER-002

**Preconditions:** HR has sent an offer for one of the candidate's applications; the offer has not expired.

**Steps:**
1. Candidate opens **Offer Review** (from a notification, or their Dashboard's Offers list).
2. Candidate reviews compensation, start date, and the response deadline.
3. Candidate opens the attached offer letter file.
4. Candidate clicks **Accept Offer** or **Decline Offer**.
5. System records the response and timestamp.
6. On accept: the application moves to `Hired`/`Offer Accepted` and an onboarding record is created (see US-C-10, US-HR-03).
7. On decline: the recruiter is notified and can reopen the pipeline for other candidates.

**Acceptance criteria:**
- An offer that has passed its expiry date shows as `Expired` and can no longer be accepted from this screen.
- The decision is final from the candidate's side — a decline cannot later be flipped to accept without the organization issuing a new offer.

---

### US-C-10 — Upload onboarding documents

**As a** newly hired candidate
**I want to** upload the documents my new employer has requested
**So that** I complete onboarding and can start on my first day

**Priority:** P1 &middot; **Traces to:** REQ-DOC-002 &middot; **Screen:** not yet built — next candidate-side screen to design

**Preconditions:** Candidate has accepted an offer; HR has created an onboarding checklist with at least one document request.

**Steps:**
1. Candidate opens their onboarding checklist (from a notification or their Dashboard).
2. Candidate sees each requested document as a checklist item (e.g. "Signed offer letter," "Proof of identity," "Tax form").
3. Candidate clicks a pending item and uploads the corresponding file.
4. System validates file type/size and stores it privately.
5. Item is marked complete; candidate's overall progress updates.
6. HR is notified when an item is completed.

**Acceptance criteria:**
- Documents are stored with the same privacy discipline as CVs (private storage, signed URLs, access limited to the candidate and the specific org's HR staff — see `security.md` §11).
- The candidate can see which items are still outstanding at a glance.

---

## Organization / Company Owner stories

### US-O-01 — Register a new organization

**As a** prospective Company Owner
**I want to** register my organization on Hirelane
**So that** my team can start posting jobs and managing hiring, once approved

**Priority:** P0 &middot; **Traces to:** REQ-AUTH-002, BR-001

**Preconditions:** None. Public signup.

**Steps:**
1. Visitor opens **Register your organization**.
2. Visitor enters organization name, industry, and company size.
3. Visitor enters their own name, work email, and a password (this becomes the Company Owner account).
4. Visitor clicks **Create organization**.
5. System creates the `Organization` with status `Pending Approval` and the user with role `Company Owner`, in one transaction.
6. System sends a confirmation email and notifies the Super Admin.
7. Visitor sees "what happens next" (submitted &rarr; platform review &rarr; approval email &rarr; start hiring).

**Acceptance criteria:**
- The organization cannot post jobs, receive applications, or otherwise transact on the platform until a Super Admin approves it (US-A-01).
- The registering user is always assigned `Company Owner` for the new org.

---

### US-O-02 — Invite a staff member

**As a** Company Owner or HR Manager with the `user:invite` permission
**I want to** invite a colleague into my organization with a specific role
**So that** they can start recruiting, interviewing, or managing hiring without me creating their account for them

**Priority:** P0 &middot; **Traces to:** REQ-AUTH-008 &middot; **Screen:** not yet built

**Preconditions:** The organization is `Active`. The inviter holds `user:invite`.

**Steps:**
1. Inviter opens **Settings &rarr; Team** (or similar) and clicks **Invite teammate**.
2. Inviter enters the invitee's email and selects a role (Recruiter, Hiring Manager, Interviewer, HR Manager — a user can be given more than one).
3. Inviter clicks **Send invite**.
4. System creates a pending, single-use, 7-day invitation and emails it.
5. Invitee clicks the link. If they don't have a Hirelane account, they set a password and one is created, pre-bound to this org and role. If they do (e.g. they're also a candidate), the role is simply attached to their existing account.
6. Invitee lands in the org workspace with the assigned role's permissions.

**Acceptance criteria:**
- Invitations cannot be sent for a non-`Active` organization.
- An invitation token can only be used once; a second click on an already-used link shows a clear "already accepted" message rather than creating a duplicate role.
- The same person can be a candidate on the public side and staff at this org under one login (see `open-questions.md` Q3).

---

## Recruiter stories

### US-R-01 — Post a new job

**As a** Recruiter or Hiring Manager
**I want to** create a job posting
**So that** candidates can discover and apply to it

**Priority:** P0 &middot; **Traces to:** REQ-JOB-001

**Preconditions:** User is logged in with `job:create` at an `Active` organization.

**Steps:**
1. Recruiter opens **Jobs** and clicks **+ Post a Job**.
2. Recruiter fills in title, department, location, employment type, and salary range.
3. Recruiter writes the description and requirements.
4. Recruiter clicks **Save Draft**.
5. System creates the `Job` with status `Draft`, scoped to the recruiter's organization.

**Acceptance criteria:**
- The job is invisible to the public marketplace while in `Draft`.
- All fields are validated (required fields, salary min &le; max, etc.) before saving.

---

### US-R-02 — Define the recruitment pipeline

**As a** Recruiter
**I want to** set the ordered stages a candidate moves through for this job
**So that** the hiring process for this role is explicit and consistent

**Priority:** P0 &middot; **Traces to:** REQ-PIPE-001

**Preconditions:** The job exists (draft or published).

**Steps:**
1. On the Job Editor, recruiter scrolls to **Recruitment Pipeline**.
2. Recruiter either selects a saved template ("Default Hiring Pipeline") and clicks **Load Template**, or builds stages manually.
3. Recruiter adds, renames, reorders (via drag handle), or removes stages.
4. Recruiter saves.
5. System snapshots the resulting stage list onto this specific job (not a live link to the template — see `database.md` §2), so editing the template later never silently changes this job's in-flight pipeline.

**Acceptance criteria:**
- A job must have at least one stage before it can be published (enforced at publish time — see US-R-03).
- The first stage is where new applications land (US-C-06); the last non-terminal stage is what a hiring decision advances out of (US-H-01).

---

### US-R-03 — Publish or close a job

**As a** Recruiter
**I want to** publish a finished draft, or close a job that's no longer hiring
**So that** the public listing accurately reflects whether the role is open

**Priority:** P0 &middot; **Traces to:** REQ-JOB-002, REQ-JOB-004

**Preconditions:** For publishing: the job is in `Draft` and has &ge;1 pipeline stage.

**Steps (publish):**
1. Recruiter opens the Job Editor for a draft job.
2. Recruiter clicks **Publish**.
3. System checks the pipeline has at least one stage; if not, shows a clear error and does not publish.
4. System sets status to `Published`; the job now appears in public search.

**Steps (close):**
1. Recruiter opens the job from the Org Dashboard or Pipeline Board.
2. Recruiter clicks **Close job**.
3. System sets status to `Closed`; the job stops accepting new applications and drops out of public search, but remains visible internally for record-keeping.

**Acceptance criteria:**
- Publishing without at least one pipeline stage is blocked with a specific, actionable error — not a generic failure.
- Closing a job never deletes existing applications or their history.

---

### US-R-04 — Screen incoming applications

**As a** Recruiter
**I want to** review new applications for a job
**So that** I can decide who moves forward and who doesn't, before investing interview time

**Priority:** P0 &middot; **Traces to:** REQ-APP-002

**Preconditions:** The job is published and has received applications.

**Steps:**
1. Recruiter opens the **Pipeline Board** for the job (or the **Recent Applications** list on the Org Dashboard).
2. Recruiter opens an application in the `Applied` column/row.
3. Recruiter reviews the candidate's CV, cover note, and profile.
4. Recruiter marks the application `Screened &rarr; pass` (moves toward Shortlisted) or `Screened &rarr; reject`.
5. If rejected, the system optionally notifies the candidate (org-configurable — see `open-questions.md` Q4).

**Acceptance criteria:**
- Every screening decision is recorded in `ApplicationStageHistory` with who made it and when.
- A recruiter can only screen applications belonging to their own organization's jobs (tenant isolation — cross-tenant attempt returns 404, per `multi-tenancy.md`).

---

### US-R-05 — Shortlist a candidate

**As a** Recruiter
**I want to** move a screened candidate into active consideration
**So that** the hiring team knows who to focus on next

**Priority:** P0 &middot; **Traces to:** REQ-APP-003

**Preconditions:** The application has passed screening.

**Steps:**
1. Recruiter opens the application (from Pipeline Board or Application Detail).
2. Recruiter clicks **Shortlist**.
3. System moves the application to the `Shortlisted` stage and logs the transition.

**Acceptance criteria:**
- Shortlisting is a stage transition like any other (US-R-07) — no separate data model, just a specific, expected move in the pipeline.

---

### US-R-06 — Schedule an interview

**As a** Recruiter
**I want to** schedule an interview for a shortlisted candidate and assign a panel
**So that** the hiring team can formally assess them

**Priority:** P0 &middot; **Traces to:** REQ-INT-001, REQ-INT-002

**Preconditions:** The application is at (or past) the Shortlisted stage; at least one org staff member is available to be assigned as interviewer.

**Steps:**
1. Recruiter opens **Schedule Interview** for the application.
2. Recruiter sets date, time, duration, and mode (Video / Onsite / Phone).
3. Recruiter enters a location or meeting link.
4. Recruiter adds one or more interviewers from the org to the panel.
5. Recruiter adds optional notes for the panel.
6. Recruiter clicks **Schedule Interview**.
7. System creates the `Interview` and `InterviewPanelMember` rows and notifies each assigned interviewer.

**Acceptance criteria:**
- Only users who belong to the same organization as the job can be assigned as interviewers.
- Rescheduling keeps history — the old slot is marked `Rescheduled` and linked to the new one, never silently overwritten.

---

### US-R-07 — Move a candidate through pipeline stages

**As a** Recruiter or Hiring Manager
**I want to** move a candidate's application from one stage to the next (or back, or to rejected)
**So that** the pipeline reflects reality at every point in the process

**Priority:** P0 &middot; **Traces to:** REQ-PIPE-002

**Preconditions:** The application exists in an active job's pipeline.

**Steps:**
1. User opens the Pipeline Board or the specific Application Detail.
2. User selects the new stage (or clicks a targeted action like **Advance to Offer** / **Reject Candidate**).
3. System records the transition (from-stage, to-stage, who, when) in `ApplicationStageHistory`.
4. System triggers any relevant notification (e.g. candidate notified on reaching Interview, per org settings).

**Acceptance criteria:**
- Transitions are not required to be strictly linear — a user can move a candidate backward or reject from any stage — but every transition is logged regardless of direction.
- Only users with a role permitted to manage the pipeline for this org can perform this action (`authorization.md` §3).

---

## Interviewer stories

### US-I-01 — View my assigned interviews

**As an** Interviewer
**I want to** see only the interviews and candidates I'm personally assigned to
**So that** I have exactly what I need and nothing I'm not supposed to see

**Priority:** P0 &middot; **Traces to:** REQ-INT-003

**Preconditions:** The interviewer has been added to at least one interview panel.

**Steps:**
1. Interviewer opens **My Interviews**.
2. Interviewer sees a list of their interviews (candidate, job, date/time, status: Scheduled / Completed).
3. Interviewer selects one to review candidate and job details before or after the interview.

**Acceptance criteria:**
- This list is filtered server-side by `interviewerId = current user` — it is not merely hidden in the UI; an interviewer cannot fetch another interviewer's assignment by guessing an ID (ownership check, not just a role check — see `authorization.md` §3).

---

### US-I-02 — Submit an interview evaluation

**As an** Interviewer
**I want to** record structured feedback after an interview
**So that** the hiring team has comparable, documented input for their decision

**Priority:** P0 &middot; **Traces to:** REQ-EVAL-001

**Preconditions:** The interview has occurred; the interviewer has not already submitted an evaluation for it.

**Steps:**
1. Interviewer selects a completed interview from **My Interviews**.
2. Interviewer scores each competency (e.g. Technical Skill, Communication, Culture Fit) on a 1&ndash;5 scale.
3. Interviewer selects an overall recommendation (Strong No / No / Yes / Strong Yes).
4. Interviewer writes free-text comments.
5. Interviewer clicks **Submit Evaluation**.
6. System creates the `Evaluation`, linked one-to-one with this interviewer's panel assignment.

**Acceptance criteria:**
- Exactly one evaluation per interviewer per interview — enforced by a unique constraint, not just UI prevention (`database.md` `Evaluation.panelMemberId @unique`).
- The evaluation is never visible to the candidate, and (per org policy) may be hidden from other panelists until they've also submitted, to avoid anchoring bias.

---

## Hiring Manager stories

### US-H-01 — Review evaluations and make a hiring decision

**As a** Hiring Manager
**I want to** review all submitted evaluations for a candidate and record a final decision
**So that** the pipeline moves to an offer or a clean rejection, based on documented evidence

**Priority:** P0 &middot; **Traces to:** REQ-HIRE-001, REQ-EVAL-002

**Preconditions:** At least one evaluation has been submitted for the candidate's interview(s).

**Steps:**
1. Hiring Manager opens **Application Detail** for the candidate.
2. Hiring Manager reviews the aggregated evaluations (each interviewer's scores, recommendation, and comments).
3. Hiring Manager reviews the candidate's pipeline progress stepper.
4. Hiring Manager clicks **Advance to Offer** or **Reject Candidate**.
5. On advance: the application is marked ready for an offer and HR is notified (see US-HR-01).
6. On reject: the application is marked `Rejected`, and the candidate is optionally notified.

**Acceptance criteria:**
- Whether a decision *requires* at least one evaluation to exist first is a business rule under discussion (`business-analysis.md` BR-RULE-5) — until confirmed, the UI should at minimum surface a clear warning if no evaluations exist yet, rather than silently allowing it.
- Who is allowed to make the final call (Hiring Manager only, vs. also Recruiter) is an open decision — see `open-questions.md` Q6.

---

## HR Manager stories

### US-HR-01 — Create and send an offer

**As an** HR Manager
**I want to** create an offer for a candidate who's been advanced past interviews
**So that** they can formally accept or decline the role

**Priority:** P0 &middot; **Traces to:** REQ-OFFER-001

**Preconditions:** The Hiring Manager has advanced the application to the offer stage (US-H-01).

**Steps:**
1. HR Manager opens **Create Offer** for the candidate.
2. HR Manager fills in job title, compensation, start date, and offer expiry date.
3. HR Manager uploads the formal offer letter document.
4. HR Manager writes a personal note to the candidate.
5. HR Manager reviews the "what the candidate will see" preview.
6. HR Manager clicks **Send Offer** (or **Save as Draft** to finish later).
7. System creates the `Offer`, sets status `Sent`, and notifies the candidate.

**Acceptance criteria:**
- An offer always has an expiry date; the candidate cannot accept after it passes (US-C-09).
- Saving as a draft does not notify the candidate — only **Send Offer** does.

---

### US-HR-02 — Track offer status

**As an** HR Manager
**I want to** see every offer I've sent and its current status
**So that** I know who's still deciding, who's accepted, and who needs a follow-up

**Priority:** P1 &middot; **Traces to:** REQ-OFFER-001, REQ-OFFER-002 &middot; **Screen:** not yet built

**Preconditions:** At least one offer has been sent by this organization.

**Steps:**
1. HR Manager opens **Offers**.
2. HR Manager sees a list of every offer with candidate, role, status (Sent / Accepted / Declined / Expired), and response deadline.
3. HR Manager filters or sorts by status.
4. HR Manager opens one to see full details or resend/extend the deadline if still pending.

**Acceptance criteria:**
- Status always reflects the current `Offer.status`; an offer past its `expiresAt` with no response shows `Expired`, not `Sent`.

---

### US-HR-03 — Request and track onboarding documents

**As an** HR Manager
**I want to** define which documents a newly hired candidate needs to submit, and track completion
**So that** onboarding is complete and nothing is missed before their start date

**Priority:** P1 &middot; **Traces to:** REQ-DOC-001, REQ-ONB-001 &middot; **Screen:** not yet built

**Preconditions:** The candidate has accepted an offer (US-C-09).

**Steps:**
1. HR Manager opens the onboarding record created automatically on offer acceptance.
2. HR Manager adds required document tasks (e.g. "Signed offer letter," "Proof of identity," "Tax form"), marking each required or optional.
3. Candidate uploads each document (US-C-10).
4. HR Manager sees each task's status (pending / submitted / verified) and can mark a submission verified or request a re-upload.
5. HR Manager sees the overall checklist reach 100% before the candidate's start date.

**Acceptance criteria:**
- Every uploaded document is private, accessible only to this org's HR staff and the candidate themself.
- The checklist's overall completion is derived from task state, never tracked as a separate, potentially-out-of-sync field.

---

## Super Admin stories

### US-A-01 — Approve or reject a new organization

**As a** Super Admin
**I want to** review a newly registered organization and approve or reject it
**So that** only legitimate organizations can operate on the platform

**Priority:** P0 &middot; **Traces to:** REQ-AUTH-003, BR-001, BR-013

**Preconditions:** An organization exists with status `Pending Approval`.

**Steps:**
1. Super Admin opens the **Org Approval Queue**.
2. Super Admin selects a pending organization and reviews its details (industry, size, owner, submitted date).
3a. **To approve:** Super Admin clicks **Approve**. System sets status to `Active` and emails the Company Owner. The organization can now post jobs and receive applications.
3b. **To reject:** Super Admin optionally enters a reason, then clicks **Reject**. System sets status to `Rejected` and emails the Company Owner with the reason (if given).
4. The action is written to the audit log.

**Acceptance criteria:**
- No organization can transact on the platform (post a job, appear in search, receive an application) while `Pending Approval` or `Rejected`.
- Every approval/rejection is attributed to the acting Super Admin and timestamped in `AuditLog`, never silently applied.

---

### US-A-02 — Monitor platform health and audit log

**As a** Super Admin
**I want to** see platform-wide stats and a log of sensitive actions
**So that** I can spot problems, review activity, and answer "who did what" questions

**Priority:** P1 &middot; **Traces to:** REQ-ANALYTICS-002, REQ-AUDIT-001

**Preconditions:** None (platform-level view).

**Steps:**
1. Super Admin opens **Platform Overview**.
2. Super Admin sees top-line counts (organizations, active organizations, candidates, jobs posted).
3. Super Admin sees the organizations currently awaiting approval, with a link to the queue (US-A-01).
4. Super Admin scans the recent audit log (actor, action, target, timestamp).
5. Super Admin opens the full audit log for deeper investigation when needed.

**Acceptance criteria:**
- The audit log is append-only — there is no edit or delete action available anywhere in the product for a log entry.
- Every entry that reads or touches a specific organization's business data (not just platform metadata) is itself logged, per the "Super Admin doesn't casually browse tenant data" policy in `security.md` §12.

---

## How to use this document

Each story above is meant to be small enough to build, test, and demo on its own — this is deliberate, since `team-plan.md` splits work across five developers by module, and a story maps naturally to one ticket (`team-plan.md` §5's task template). When a story references a screen "not yet built," that's a flag for the next round of prototype/design work, not a gap in the requirements — the underlying `REQ-*` and `BR-*` entries already exist in `requirements.md` and `business-analysis.md`.
