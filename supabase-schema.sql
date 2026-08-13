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

-- User-submitted content is durable in Supabase, rather than in the deployed
-- SQLite schedule cache. Reads are public so course pages can show aggregate
-- ratings and requirement notes; inserts must always be from a signed-in user.
create table if not exists ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  instructor text not null check (char_length(instructor) between 1 and 160),
  college text not null check (college in ('GW', 'OC', 'CL')),
  rating integer not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists course_requirements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  college text not null check (college in ('GW', 'OC', 'CL')),
  subject text not null check (char_length(subject) between 1 and 20),
  course_number text not null check (char_length(course_number) between 1 and 20),
  requirement_text text not null check (char_length(requirement_text) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists ratings_instructor_college_idx on ratings (instructor, college);
create index if not exists course_requirements_course_idx on course_requirements (college, subject, course_number);

alter table planner_terms enable row level security;
alter table planner_courses enable row level security;
alter table ratings enable row level security;
alter table course_requirements enable row level security;

create policy "Users manage their own terms" on planner_terms
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own planned courses" on planner_courses
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Anyone can read ratings" on ratings for select using (true);
create policy "Signed-in users create ratings" on ratings
  for insert to authenticated with check (auth.uid() = user_id);

create policy "Anyone can read course requirements" on course_requirements for select using (true);
create policy "Signed-in users create course requirements" on course_requirements
  for insert to authenticated with check (auth.uid() = user_id);
