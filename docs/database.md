# Database Design

Status: DRAFT v1.0 — Prisma schema below is a **proposal** for team review, not final. Confirm open questions in `open-questions.md` before running the first migration.

## 1. Entity List

Identity & tenancy: `User`, `Organization`, `UserOrganizationRole`, `Role`, `Permission`, `RolePermission`, `Invitation`.
Recruitment core: `Job`, `PipelineTemplate`, `PipelineStageTemplate`, `RecruitmentStage`, `Application`, `ApplicationStageHistory`.
Candidate data: `CandidateProfile`, `Education`, `Experience`, `Skill`, `CV`.
Interviewing: `Interview`, `InterviewPanelMember`, `Evaluation`.
Hiring: `Offer`.
Onboarding: `OnboardingChecklist`, `OnboardingTask`, `Document`.
Sourcing: `TalentPool`, `TalentPoolCandidate`, `University`, `UniversityPartnership`.
Commercial: `Plan`, `Subscription`, `Payment`.
Platform: `Notification`, `AuditLog`.

## 2. ERD Description (prose, by cluster)

**Identity & tenancy.** `User` is the single identity table for every human actor (candidate or staff) — one login can be a candidate on the public side and staff at an org. `Organization` is the tenant root. `UserOrganizationRole` is the join between them (many-to-many, since a user can belong to 0 orgs as a pure candidate, or 1+ orgs as staff, and can hold multiple roles within one org). `Role` and `Permission` are platform-defined (seeded, not user-editable in MVP — see `authorization.md`); `RolePermission` maps them. `Invitation` tracks pending staff invites before a `User`/`UserOrganizationRole` exists.

**Recruitment core.** `Job` belongs to `Organization`. A `PipelineTemplate` (org-owned, reusable) has ordered `PipelineStageTemplate`s; when a `Job` is created it snapshots its template into `RecruitmentStage` rows *scoped to that job* (not shared references) so that editing a template later never silently changes an in-flight job's pipeline. `Application` links `Candidate` (via `User`) + `Job`, and denormalizes `organizationId` (copied from `Job.organizationId` at creation) — this single denormalized field is what makes every tenant-scoped query on applications a simple indexed `WHERE organizationId = ?` instead of a join, and it is the cornerstone of the tenant-isolation strategy (§5). `ApplicationStageHistory` is an append-only log of stage transitions (who moved it, when, from/to).

**Candidate data.** `CandidateProfile`, `Education`, `Experience`, `Skill`, `CV` all hang off `User` (role CANDIDATE), not off any organization — this data is candidate-owned and portable across every application the candidate makes.

**Interviewing.** `Interview` belongs to `Application` (and therefore transitively to an org). `InterviewPanelMember` joins `Interview` to the `User`s assigned as interviewers. `Evaluation` belongs to one `InterviewPanelMember` (one evaluation per assigned interviewer per interview) — this is what lets us enforce "an interviewer can only submit exactly one evaluation, only for their own assignment."

**Hiring & onboarding.** `Offer` belongs to `Application`. `OnboardingChecklist` belongs to `Offer` (created on acceptance) and has many `OnboardingTask`s; `Document` can attach to an `OnboardingTask` (or stand alone for CVs — see note below) and is always privately stored.

**Sourcing.** `TalentPool` is org-owned; `TalentPoolCandidate` joins it to `User`s (candidates), independent of any specific application.

**Commercial.** `Plan` is a platform-seeded catalog (Free/Starter/Pro, etc.). `Subscription` belongs to `Organization` + `Plan`. `Payment` belongs to `Subscription`, one row per Stripe transaction/webhook event.

**Platform.** `Notification` belongs to `User` (recipient). `AuditLog` is a flat, append-only table with a polymorphic-ish `actorId`, `organizationId` (nullable for platform-level actions), `action`, `targetType`/`targetId`, and a JSON `metadata` snapshot.

## 3. Normalization Notes

- `Application.organizationId` is a deliberate denormalization (from `Job.organizationId`) for tenant-isolation query performance and simplicity — this is the *one* sanctioned denormalization in the schema and it's documented here so no one "fixes" it into a join later without realizing why it's there.
- `CV` is modeled once as a document a candidate owns, referenced (not copied) by `Application.cvId` at submission time. We do **not** duplicate CV content per application; we keep an `Application.cvSnapshotUrl` pointer only if the team later decides candidates should be able to edit their primary CV without altering what a past application shows a recruiter (flagged as open question Q7 — affects whether `Application` needs its own CV reference vs. always reading the candidate's current CV).
- Skills could be free-text per candidate or a shared lookup table (`Skill` catalog + join table) for future search/matching. MVP recommendation: free-text tags now, promote to a catalog table only if/when AI matching is built (avoids premature complexity — see architecture §7).

## 4. Prisma Schema Proposal

```prisma
// schema.prisma — PROPOSAL, not final. datasource/generator blocks omitted for brevity.

enum OrganizationStatus {
  PENDING_APPROVAL
  ACTIVE
  REJECTED
  SUSPENDED
}

enum JobStatus {
  DRAFT
  PUBLISHED
  CLOSED
  ARCHIVED
}

enum ApplicationStatus {
  ACTIVE
  WITHDRAWN
  REJECTED
  HIRED
}

enum OfferStatus {
  SENT
  ACCEPTED
  DECLINED
  EXPIRED
}

enum EvaluationRecommendation {
  STRONG_YES
  YES
  NO
  STRONG_NO
}

model User {
  id              String   @id @default(cuid())
  email           String   @unique
  passwordHash    String
  fullName        String
  emailVerified   Boolean  @default(false)
  isSuperAdmin    Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  orgRoles        UserOrganizationRole[]
  candidateProfile CandidateProfile?
  refreshTokens   RefreshToken[]
  notifications   Notification[]
  applications    Application[]          @relation("CandidateApplications")
  panelMemberships InterviewPanelMember[]

  @@index([email])
}

model RefreshToken {
  id          String   @id @default(cuid())
  userId      String
  tokenHash   String   @unique
  expiresAt   DateTime
  revokedAt   DateTime?
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model Organization {
  id          String              @id @default(cuid())
  name        String
  status      OrganizationStatus  @default(PENDING_APPROVAL)
  createdAt   DateTime            @default(now())
  approvedAt  DateTime?
  rejectedReason String?

  userRoles       UserOrganizationRole[]
  jobs            Job[]
  pipelineTemplates PipelineTemplate[]
  talentPools     TalentPool[]
  subscription    Subscription?
  universityPartnerships UniversityPartnership[]
  invitations     Invitation[]

  @@index([status])
}

model Role {
  id          String   @id @default(cuid())
  key         String   @unique // e.g. "RECRUITER", "HIRING_MANAGER"
  name        String
  isPlatformRole Boolean @default(false) // true only for SUPER_ADMIN

  permissions RolePermission[]
  userRoles   UserOrganizationRole[]
}

model Permission {
  id     String @id @default(cuid())
  key    String @unique // e.g. "job:create", "application:screen"
  roles  RolePermission[]
}

model RolePermission {
  roleId        String
  permissionId  String
  role          Role       @relation(fields: [roleId], references: [id])
  permission    Permission @relation(fields: [permissionId], references: [id])

  @@id([roleId, permissionId])
}

model UserOrganizationRole {
  id             String       @id @default(cuid())
  userId         String
  organizationId String
  roleId         String
  createdAt      DateTime     @default(now())

  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  role           Role         @relation(fields: [roleId], references: [id])

  @@unique([userId, organizationId, roleId])
  @@index([organizationId])
  @@index([userId])
}

model Invitation {
  id             String   @id @default(cuid())
  organizationId String
  email          String
  roleId         String
  tokenHash      String   @unique // hashed, not raw -- see open-questions.md Q16
  expiresAt      DateTime
  acceptedAt     DateTime?
  createdAt      DateTime @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
}

model Job {
  id              String    @id @default(cuid())
  organizationId  String
  title           String
  description     String
  department      String?
  location        String?
  employmentType  String?
  status          JobStatus @default(DRAFT)
  createdById     String
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  publishedAt     DateTime?
  closedAt        DateTime?

  organization    Organization       @relation(fields: [organizationId], references: [id])
  stages          RecruitmentStage[]
  applications    Application[]

  @@index([organizationId, status])
  @@index([status, publishedAt]) // public search
}

model PipelineTemplate {
  id             String   @id @default(cuid())
  organizationId String
  name           String

  organization   Organization @relation(fields: [organizationId], references: [id])
  stages         PipelineStageTemplate[]

  @@index([organizationId])
}

model PipelineStageTemplate {
  id                  String   @id @default(cuid())
  pipelineTemplateId  String
  name                String
  order               Int

  pipelineTemplate    PipelineTemplate @relation(fields: [pipelineTemplateId], references: [id], onDelete: Cascade)

  @@index([pipelineTemplateId])
}

// Snapshotted per-job, NOT a live reference to the template (see database.md §2)
model RecruitmentStage {
  id      String @id @default(cuid())
  jobId   String
  name    String
  order   Int

  job          Job           @relation(fields: [jobId], references: [id], onDelete: Cascade)
  applications Application[]

  @@index([jobId])
}

model CandidateProfile {
  userId      String   @id
  headline    String?
  location    String?
  phone       String?
  updatedAt   DateTime @updatedAt

  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  education   Education[]
  experience  Experience[]
  skills      Skill[]
  cvs         CV[]
}

model Education {
  id          String @id @default(cuid())
  candidateId String
  institution String
  degree      String?
  startYear   Int?
  endYear     Int?

  candidate   CandidateProfile @relation(fields: [candidateId], references: [userId], onDelete: Cascade)

  @@index([candidateId])
}

model Experience {
  id           String    @id @default(cuid())
  candidateId  String
  company      String
  title        String
  startDate    DateTime?
  endDate      DateTime?
  description  String?

  candidate    CandidateProfile @relation(fields: [candidateId], references: [userId], onDelete: Cascade)

  @@index([candidateId])
}

model Skill {
  id          String @id @default(cuid())
  candidateId String
  name        String

  candidate   CandidateProfile @relation(fields: [candidateId], references: [userId], onDelete: Cascade)

  @@index([candidateId])
}

model CV {
  id           String   @id @default(cuid())
  candidateId  String
  fileKey      String   // private storage object key, NOT a public URL
  fileName     String
  isPrimary    Boolean  @default(false)
  uploadedAt   DateTime @default(now())

  candidate    CandidateProfile @relation(fields: [candidateId], references: [userId], onDelete: Cascade)
  applications Application[]

  @@index([candidateId])
}

model Application {
  id              String            @id @default(cuid())
  jobId           String
  candidateId     String            // User.id (role CANDIDATE)
  organizationId  String            // denormalized from Job — see §3
  cvId            String
  stageId         String
  status          ApplicationStatus @default(ACTIVE)
  coverNote        String?
  appliedAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  job             Job               @relation(fields: [jobId], references: [id])
  candidate       User              @relation("CandidateApplications", fields: [candidateId], references: [id])
  cv              CV                @relation(fields: [cvId], references: [id])
  stage           RecruitmentStage  @relation(fields: [stageId], references: [id])
  stageHistory    ApplicationStageHistory[]
  interviews      Interview[]
  offer           Offer?

  @@unique([jobId, candidateId], name: "one_active_application_per_job") // enforced further at service layer for status=ACTIVE only
  @@index([organizationId, status])
  @@index([jobId])
  @@index([candidateId])
}

model ApplicationStageHistory {
  id             String   @id @default(cuid())
  applicationId  String
  fromStageId    String?
  toStageId      String
  movedById      String
  movedAt        DateTime @default(now())

  application    Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicationId])
}

model Interview {
  id             String    @id @default(cuid())
  applicationId  String
  organizationId String    // denormalized, same rationale as Application
  scheduledAt    DateTime
  mode           String    // ONSITE | VIDEO | PHONE
  status         String    @default("SCHEDULED") // SCHEDULED | COMPLETED | RESCHEDULED | CANCELLED
  rescheduledToId String?

  application    Application @relation(fields: [applicationId], references: [id])
  panel          InterviewPanelMember[]

  @@index([organizationId])
  @@index([applicationId])
}

model InterviewPanelMember {
  id            String   @id @default(cuid())
  interviewId   String
  interviewerId String   // User.id

  interview     Interview @relation(fields: [interviewId], references: [id], onDelete: Cascade)
  interviewer   User      @relation(fields: [interviewerId], references: [id])
  evaluation    Evaluation?

  @@unique([interviewId, interviewerId])
  @@index([interviewerId])
}

model Evaluation {
  id                 String   @id @default(cuid())
  panelMemberId      String   @unique  // enforces exactly one evaluation per assignment
  scores             Json     // { competency: score, ... } — org-configurable competencies
  comment            String?
  recommendation     EvaluationRecommendation
  submittedAt        DateTime @default(now())

  panelMember        InterviewPanelMember @relation(fields: [panelMemberId], references: [id], onDelete: Cascade)
}

model Offer {
  id             String      @id @default(cuid())
  applicationId  String      @unique
  organizationId String
  title          String
  compensation   String?
  startDate      DateTime?
  expiresAt      DateTime
  status         OfferStatus @default(SENT)
  sentAt         DateTime    @default(now())
  respondedAt    DateTime?

  application    Application @relation(fields: [applicationId], references: [id])
  checklist      OnboardingChecklist?

  @@index([organizationId, status])
}

model OnboardingChecklist {
  id        String   @id @default(cuid())
  offerId   String   @unique
  createdAt DateTime @default(now())

  offer     Offer            @relation(fields: [offerId], references: [id])
  tasks     OnboardingTask[]
}

model OnboardingTask {
  id           String   @id @default(cuid())
  checklistId  String
  name         String
  required     Boolean  @default(true)
  completedAt  DateTime?

  checklist    OnboardingChecklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)
  documents    Document[]

  @@index([checklistId])
}

model Document {
  id           String   @id @default(cuid())
  taskId       String?
  uploadedById String
  fileKey      String   // private storage key
  fileName     String
  uploadedAt   DateTime @default(now())

  task         OnboardingTask? @relation(fields: [taskId], references: [id])

  @@index([taskId])
}

model TalentPool {
  id             String   @id @default(cuid())
  organizationId String
  name           String

  organization   Organization @relation(fields: [organizationId], references: [id])
  candidates     TalentPoolCandidate[]

  @@index([organizationId])
}

model TalentPoolCandidate {
  talentPoolId String
  candidateId  String
  addedAt      DateTime @default(now())

  talentPool   TalentPool @relation(fields: [talentPoolId], references: [id], onDelete: Cascade)

  @@id([talentPoolId, candidateId])
}

model University {
  id      String   @id @default(cuid())
  name    String   @unique

  partnerships UniversityPartnership[]
}

model UniversityPartnership {
  id             String   @id @default(cuid())
  organizationId String
  universityId   String
  startedAt      DateTime @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id])
  university     University   @relation(fields: [universityId], references: [id])

  @@unique([organizationId, universityId])
}

model Plan {
  id           String   @id @default(cuid())
  key          String   @unique // FREE | STARTER | PRO
  name         String
  maxActiveJobs Int?
  maxSeats     Int?
  priceCents   Int
  subscriptions Subscription[]
}

model Subscription {
  id             String   @id @default(cuid())
  organizationId String   @unique
  planId         String
  stripeCustomerId String?
  stripeSubscriptionId String?
  status         String   @default("ACTIVE") // ACTIVE | PAST_DUE | CANCELLED
  currentPeriodEnd DateTime?

  organization   Organization @relation(fields: [organizationId], references: [id])
  plan           Plan         @relation(fields: [planId], references: [id])
  payments       Payment[]
}

model Payment {
  id              String   @id @default(cuid())
  subscriptionId  String
  stripeEventId   String   @unique // idempotency for webhook processing
  amountCents     Int
  status          String   // SUCCEEDED | FAILED | REFUNDED
  createdAt       DateTime @default(now())

  subscription    Subscription @relation(fields: [subscriptionId], references: [id])

  @@index([subscriptionId])
}

model Notification {
  id          String   @id @default(cuid())
  userId      String
  type        String
  payload     Json
  readAt      DateTime?
  createdAt   DateTime @default(now())

  user        User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, readAt])
}

model AuditLog {
  id             String   @id @default(cuid())
  actorId        String?  // nullable: system-initiated actions
  organizationId String?  // nullable: platform-level actions
  action         String   // e.g. "organization.approved", "user.role_changed"
  targetType     String
  targetId       String
  metadata       Json?
  createdAt      DateTime @default(now())

  @@index([organizationId, createdAt])
  @@index([actorId])
}
```

## 5. Index Strategy

The recurring pattern in this schema is: **every tenant-scoped table gets a composite index led by `organizationId`**, because virtually every query in the system will be shaped "give me X for org Y" (`Job`, `Application`, `Interview`, `Offer`, `TalentPool`, `AuditLog`). Secondary indexes support the next-most-common filter (status, foreign key lookups). `User.email` is uniquely indexed for login lookups. `Job` additionally gets a `(status, publishedAt)` index to serve the public search endpoint efficiently across all tenants.

Composite/unique constraints double as business-rule enforcement where possible (`@@unique([jobId, candidateId])` on `Application`, `@@unique([interviewId, interviewerId])` on `InterviewPanelMember`, `@@unique([panelMemberId])` on `Evaluation`) — never rely on application code alone to prevent duplicates the database can prevent for free.

## 6. Tenant Isolation Strategy (schema level)

This project uses **shared database, shared schema, row-level tenant isolation** (as opposed to schema-per-tenant or database-per-tenant). Rationale, trade-offs, and the enforcement plan (this is a security control, not just a data-modeling choice) are documented in `decisions/ADR-002-multi-tenancy-strategy.md` and `multi-tenancy.md`. In one sentence: every tenant-owned table carries `organizationId`, and no query path is allowed to skip filtering by it — that rule is enforced in the service layer via a shared base pattern, not left to each developer to remember per-endpoint.
