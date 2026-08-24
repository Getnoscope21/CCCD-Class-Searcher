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

-- Section-level snapshot fields, added after the initial release so a planned
-- course can carry the specific section's CRN and meeting time (used for
-- schedule-conflict detection and .ics export -- see meeting-parser.ts and
-- the /api/planner/conflicts and /api/planner/ics routes). All
-- nullable/backfilled as null on existing rows -- `add column if not exists`
-- makes re-running this whole script safe on a database that already has
-- the base tables.
alter table planner_courses add column if not exists crn text;
alter table planner_courses add column if not exists term text;
alter table planner_courses add column if not exists meeting_info text;
alter table planner_courses add column if not exists location text;

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

-- Seat/waitlist alerts: "email me when this closed section opens up."
-- Anonymous (no login needed, just an email address), so insert is public.
-- There is deliberately NO public select/delete policy -- reading and
-- clearing alerts happens only from the scraper job (src/scraper.ts) using
-- the Supabase service_role key, which bypasses RLS entirely. That key must
-- only ever live in the scraper's environment (a GitHub Actions secret),
-- never sent to the browser like the anon key is.
create table if not exists seat_alerts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  college text not null,
  subject text not null,
  course_number text not null,
  crn text not null,
  term text not null,
  created_at timestamptz not null default now()
);

alter table seat_alerts enable row level security;
create policy "Anyone can create a seat alert" on seat_alerts for insert with check (true);
