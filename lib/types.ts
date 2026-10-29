export interface Experience {
  id: string;
  title: string;
  company: string;
  start: string;
  end: string;
  description: string;
  hidden: boolean;
  source: 'self';
}

export interface Verification {
  id: string;
  source: 'github' | 'linkedin' | 'work-email' | 'stripe' | 'vercel';
  label: string;
  verifiedAt: string;
  subject?: string;
  data: Record<string, string | number | boolean | string[]>;
}

export type WorkMode = 'remote' | 'hybrid' | 'onsite';

export interface SalaryPreference {
  min?: number;
  currency: string;
}

export interface TalentProfile {
  searchable?: boolean;
  personId: string;
  alias: string;
  publicSummary: string;
  headline: string;
  about: string;
  experience: Experience[];
  verified: Verification[];
  openTo: string;
  preferences: string;
  salary: SalaryPreference;
  salaryMin?: number;
  salaryCurrency: string;
  locations: string[];
  workModes: WorkMode[];
  noGos: string;
  employerDomains: string[];
  version: number;
  updatedAt: string;
}

export interface ProfileDraft {
  headline: string;
  about: string;
  experience: Experience[];
}

/** The only candidate fields companies receive before a match. */
export interface CandidateCard {
  alias: string;
  publicSummary: string;
  badges: Verification['source'][];
  openTo: string;
}

export interface CandidateSearch {
  profiles: CandidateCard[];
  capped: boolean;
}

export type TalentCaller = string | { id: string; kind?: string; archived?: boolean; email?: string };
