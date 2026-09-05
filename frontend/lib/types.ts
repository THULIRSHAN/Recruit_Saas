// Mirrors backend/src/jobs/jobs.service.ts's toPublicDetail() shape.
export interface PublicJob {
  id: string;
  title: string;
  description: string;
  department: string | null;
  location: string | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  publishedAt: string | null;
  organization: { id: string; name: string };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'] as const;

export type ApplicationStatus = 'ACTIVE' | 'WITHDRAWN' | 'REJECTED' | 'HIRED';

// Mirrors backend/src/applications/applications.service.ts's toDetail().
export interface Application {
  id: string;
  status: ApplicationStatus;
  coverNote: string | null;
  appliedAt: string;
  updatedAt: string;
  job: { id: string; title: string; organization: { id: string; name: string } };
  cv: { id: string; fileName: string };
  stage: { id: string; name: string };
}

export type OfferStatus = 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

// Mirrors backend/src/offers/offers.service.ts's toDetail().
export interface Offer {
  id: string;
  title: string;
  compensation: string | null;
  startDate: string | null;
  expiresAt: string;
  status: OfferStatus;
  sentAt: string;
  respondedAt: string | null;
}

export interface CandidateCv {
  id: string;
  fileName: string;
  isPrimary: boolean;
  uploadedAt: string;
}

export interface CandidateEducation {
  id: string;
  institution: string;
  degree: string;
  startYear: number | null;
  endYear: number | null;
}

export interface CandidateExperience {
  id: string;
  company: string;
  title: string;
  startDate: string;
  endDate: string | null;
  description: string | null;
}

export interface CandidateSkill {
  id: string;
  name: string;
}

// Mirrors backend/src/candidates/candidates.service.ts's toDetail().
export type JobStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED';

// Mirrors backend/src/jobs/jobs.service.ts's toDetail() (org-facing, wider
// than the public search shape above).
export interface Job {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  department: string | null;
  location: string | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  status: JobStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  closedAt: string | null;
}

export interface RecruitmentStage {
  id: string;
  name: string;
  order: number;
}

export interface PipelineTemplate {
  id: string;
  organizationId: string;
  name: string;
  stages: { id: string; name: string; order: number }[];
}

export type EvaluationRecommendation = 'STRONG_YES' | 'YES' | 'NO' | 'STRONG_NO';

// backend/src/interviews/interviews.service.ts's toEvaluationDetail().
export interface Evaluation {
  id: string;
  scores: Record<string, number>;
  comment: string | null;
  recommendation: EvaluationRecommendation;
  submittedAt: string;
  interviewId: string;
  interviewer: { id: string; fullName: string; email: string };
}

export type InterviewStatus = 'SCHEDULED' | 'COMPLETED' | 'RESCHEDULED' | 'CANCELLED';

// Org-staff view (backend/src/interviews/interviews.service.ts's toDetail()).
export interface OrgInterview {
  id: string;
  scheduledAt: string;
  mode: string;
  status: InterviewStatus;
  rescheduledToId: string | null;
  panel: { id: string; interviewer: { id: string; fullName: string; email: string } }[];
}

// Interviewer's own view (toMineDetail()) -- no panel identities, just the
// application/job/candidate context.
export interface MyInterview {
  id: string;
  scheduledAt: string;
  mode: string;
  status: InterviewStatus;
  rescheduledToId: string | null;
  application: {
    id: string;
    job: { id: string; title: string };
    candidate: { id: string; fullName: string };
  };
}

// Org-staff view of an application (backend/src/applications/applications.service.ts's toOrgDetail()).
export interface OrgApplication {
  id: string;
  status: ApplicationStatus;
  coverNote: string | null;
  rejectedReason: string | null;
  appliedAt: string;
  updatedAt: string;
  candidate: { id: string; fullName: string; email: string };
  cv: { id: string; fileName: string };
  stage: { id: string; name: string };
}

// SUSPENDED exists in the schema but nothing transitions an org to it yet
// -- kept here for type accuracy, not surfaced as its own admin tab.
export type OrganizationStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';

export interface AdminOrganization {
  id: string;
  name: string;
  status: OrganizationStatus;
  createdAt: string;
  approvedAt: string | null;
  rejectedReason: string | null;
}

export interface PlatformAnalytics {
  organizations: { total: number; byStatus: Record<string, number> };
  jobs: { total: number; byStatus: Record<string, number> };
  applications: { total: number; byStatus: Record<string, number> };
  subscriptions: { total: number; byPlan: Record<string, number> };
}

export interface OrgMember {
  id: string;
  fullName: string;
  email: string;
  roles: string[];
}

export interface CandidateProfile {
  headline: string | null;
  location: string | null;
  phone: string | null;
  education: CandidateEducation[];
  experience: CandidateExperience[];
  skills: CandidateSkill[];
  cvs: CandidateCv[];
}
