export type CollegeCode = "GW" | "OC" | "CL";

export type Modality = "Live Online" | "Online" | "TBA" | "In-Person";

export interface CourseSection {
  id?: number;
  college: CollegeCode;
  term: string;
  term_desc: string | null;
  subject: string;
  course_number: string;
  title: string;
  crn: string;
  status: string;
  credits: string;
  meeting_info: string;
  location: string;
  cap: number | null;
  act: number | null;
  wl_cap: number | null;
  wl_act: number | null;
  instructor: string;
  date_range: string;
  weeks: string;
  updated_at?: string;
}

export interface RatingSummary {
  instructor: string;
  college: CollegeCode;
  avg_rating: number;
  rating_count: number;
}

export interface CourseCatalog {
  college: CollegeCode;
  subject: string;
  course_number: string;
  description: string | null;
  corequisites: string | null;
  transfer_credit: string | null;
}

export interface RequirementCategory {
  key: string;
  label: string;
  codes: readonly string[];
}

export type SqlValue = string | number | bigint | Buffer | null;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
