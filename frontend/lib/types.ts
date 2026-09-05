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
export interface CandidateProfile {
  headline: string | null;
  location: string | null;
  phone: string | null;
  education: CandidateEducation[];
  experience: CandidateExperience[];
  skills: CandidateSkill[];
  cvs: CandidateCv[];
}
