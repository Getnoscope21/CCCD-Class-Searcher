export type CollegeCode = "GW" | "OC" | "CL";
export type Theme = "light" | "dark";
export type AppTab = "classes" | "professors" | "planner";
export type CourseTab = "overview" | "sections" | "requirements";

export interface College {
  code: CollegeCode;
  name: string;
}
export interface Requirement {
  key: string;
  label: string;
}
export interface RatingSummary {
  avg_rating: number | null;
  rating_count: number;
}

export interface CourseCard extends RatingSummary {
  college: CollegeCode;
  subject: string;
  course_number: string;
  title: string;
  term: string;
  term_desc: string | null;
  section_count: number;
  units_min: number | null;
  units_max: number | null;
  seats_available: number;
  requirement_count: number;
  description: string | null;
}

export interface Section extends RatingSummary {
  college: CollegeCode;
  crn: string;
  credits: string;
  status: string;
  modality: string;
  instructor: string;
  meeting_info: string;
  location: string;
  cap: number | null;
  act: number | null;
}

export interface CourseRequirement {
  id: number;
  requirement_text: string;
  created_at: string;
}
export interface CourseDetail {
  college: CollegeCode;
  subject: string;
  course_number: string;
  title: string | null;
  term: string;
  term_desc?: string | null;
  description: string | null;
  corequisites: string | null;
  transfer_credit: string | null;
  assist_url: string | null;
  sections: Section[];
  requirements: CourseRequirement[];
}

export interface Instructor extends RatingSummary {
  instructor: string;
  college: CollegeCode;
  section_count: number;
  rmp_search_url: string;
}

export interface AppConfig {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
}
export interface PlannerCourse {
  college: CollegeCode;
  subject: string;
  course_number: string;
  title: string | null;
  units: number | null;
}
export interface PlannerTerm {
  id: string;
  label: string;
  position?: number;
  courses: PlannerCourse[];
}
export interface PlannerPlan {
  terms: PlannerTerm[];
}
