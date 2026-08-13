import type {
  AppConfig,
  College,
  CourseCard,
  CourseDetail,
  CourseRequirement,
  Instructor,
  Requirement,
} from "./types";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(
    path,
    accessToken || init?.headers ? { ...init, headers } : init,
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  config: () => request<AppConfig>("/api/config"),
  colleges: () => request<College[]>("/api/colleges"),
  requirements: () => request<Requirement[]>("/api/ge-requirements"),
  courseCards: (params: URLSearchParams) =>
    request<CourseCard[]>(`/api/course-cards?${params}`),
  instructors: (params: URLSearchParams) =>
    request<Instructor[]>(`/api/instructors?${params}`),
  course: (college: string, subject: string, number: string) =>
    request<CourseDetail>(
      `/api/course/${encodeURIComponent(college)}/${encodeURIComponent(subject)}/${encodeURIComponent(number)}`,
    ),
  addRequirement: (body: {
    college: string;
    subject: string;
    course_number: string;
    text: string;
  }) =>
    request<{ requirements: CourseRequirement[] }>("/api/course-requirements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  addRating: (body: {
    instructor: string;
    college: string;
    rating: number;
    comment: string;
  }) =>
    request<RatingSummary>("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};

interface RatingSummary {
  avg_rating: number;
  rating_count: number;
}
