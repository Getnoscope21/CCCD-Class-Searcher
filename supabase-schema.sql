-- Run this once in the Supabase project's SQL Editor (Project -> SQL Editor -> New query).
-- Creates the planner tables and locks them down with Row Level Security so
-- each signed-in user can only ever see/modify their own rows -- Supabase
-- enforces this at the database level based on the authenticated user's
-- token, not anything the client-side JS claims about itself.

create table if not exists planner_terms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists planner_courses (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references planner_terms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  college text not null,
  subject text not null,
  course_number text not null,
  title text,
  units numeric,
  created_at timestamptz not null default now(),
  unique (term_id, college, subject, course_number)
);

alter table planner_terms enable row level security;
alter table planner_courses enable row level security;

create policy "Users manage their own terms" on planner_terms
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own planned courses" on planner_courses
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
