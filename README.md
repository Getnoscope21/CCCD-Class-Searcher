# Coast Colleges Class Finder

A class + professor search tool for Golden West College, Orange Coast College, and
Coastline Community College (all Coast Community College District), pulling live
data from the district's own public schedule search system.

## What it does

- Browse classes as course cards (grouped by subject + number), with a single
  filter panel for search, college, GE requirement area, modality, units, and
  enrollment status, and sort by relevance, units, rating, seats, requirements,
  semester, or time
- Filter by actual General Education requirement area (English Composition,
  Arts, Social & Behavioral Sciences, etc.) -- sourced from CCCD's own course
  attribute data (the same CALGETC/IGETC codes their own search form uses),
  not guessed from subject/title
- Click a course card for its real catalog description, corequisites, every
  section (CRN/instructor/meeting time/seats/status), and user-submitted
  "requirements" notes
- Browse/search professors, with a native student rating system plus a link
  out to a RateMyProfessor search (no scraping of RMP content -- see note below)
- A Planner tab to sketch out a multi-semester schedule: sign in, add classes
  to semesters you create, see per-semester and total unit counts. Accounts
  and planner data live in Supabase (a hosted Postgres + auth service), tied
  to your login rather than one browser/device

## Data source

`ssb-prod.ec.cccd.edu` -- CCCD's public Banner self-service schedule search, the
same system all three colleges link to from their own "Class Schedule" pages.
It's a public, unauthenticated system with no bot protection, intended for
prospective students to browse. `src/scraper.ts` submits the same search form the
public website form does and parses the results table.

## Setup

```bash
nvm use                        # uses Node 22 from .nvmrc
npm install
npm run scrape -- 202670 "Fall 2026" # populates data.db; rerun periodically
npm run build
npm start                      # starts the web app on :3000
```

Then open `http://localhost:3000`.

## Refreshing data

Course data (seats, status, open/closed) changes throughout registration.
Re-run `npm run scrape -- <term> "<term desc>"` on a schedule (e.g. a cron job
every few hours) to keep it current. Term codes come from the college's own
"Class Schedule" page dropdown (format: YYYYNN, e.g. `202670` = Fall 2026).

A full run (without `--skip-descriptions`) also re-fetches course descriptions
and GE requirement tags -- the latter works by re-querying CCCD's search with
each GE "Attribute" code (`sel_attrib`) and recording which courses match, so
it's ~11 extra requests per college. Both are slow-changing catalog data, not
live seat counts, so there's no need to run this as often as the light refresh.

## Deploying publicly

This is a TypeScript Node/Express app with a framework-free TypeScript frontend
and a local SQLite file -- it'll run on
any standard Node host (a small VPS, Render, Railway, Fly.io, etc.). Nothing
here needs a database server, just disk space for `data.db`. Set the `PORT`
env var if your host requires it.

Before making this public, worth doing:
- Add basic rate limiting (e.g. `express-rate-limit`) so the app itself
  doesn't become a way to hammer CCCD's system indirectly
- Keep the scraper's request rate polite (it's already just 3 requests per
  refresh -- one per college -- so this is low-risk as-is)
- Double check GWC/OCC/Coastline don't have a specific policy against
  third-party tools built on their public schedule data before going public

### Free hosting on Render + GitHub Actions

`data.db` is committed to the repo pre-seeded with course data and
descriptions, so a fresh deploy has real content immediately.

Scraping and parsing CCCD's raw HTML (`cheerio` builds a full DOM from
several megabytes of markup per college) is memory-heavy enough to crash a
Render free instance (512MB RAM) if it runs inside the live web process --
so refreshing does NOT happen on Render at all. Instead, a GitHub Actions
workflow (`.github/workflows/refresh.yml`, runs every 20 minutes, free and
unmetered on a public repo since GitHub Actions runners have several GB of
RAM) does the scrape, commits the updated `data.db`, and pushes it. Render
auto-deploys on every push to `main` by default, which picks up the fresh
data a minute or two later.

1. **Render** (render.com): New → Web Service → connect this GitHub repo.
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Plan: Free
   - Deploy. You'll get a public URL like `https://your-app.onrender.com`.
   - Confirm "Auto-Deploy" is enabled in the service settings (on by default)
     so it redeploys automatically whenever the workflow pushes new data.

   Free-tier caveat: the service still spins down after 15 minutes idle
   (first visitor after that waits ~30-50s for a cold start), and since
   there's no persistent disk, anything written at runtime (new ratings,
   requirements) is lost on the next redeploy or restart. The scraped
   course/seat data isn't affected by that, since it's baked into each
   deploy via the committed `data.db` rather than written at runtime.

2. **GitHub Actions**: nothing to configure -- `.github/workflows/refresh.yml`
   already has the `contents: write` permission it needs to commit using the
   repo's built-in token, no secrets required. GitHub disables scheduled
   workflows after 60 days with no commits to the repo, but the workflow's
   own commits count, so it keeps itself alive indefinitely once running.

For always-on hosting without these tradeoffs (no cold starts, no data loss,
reuses the exact same cron approach used locally), a small VPS (~$5-6/month)
is the simpler and more reliable option -- just `git clone`, `npm install && npm run build`,
`crontab` the same refresh commands from the section above, and run the
server behind a process manager like `pm2` or a systemd unit.

### Accounts and the Planner (Supabase)

Unlike ratings/requirements (still local SQLite, still wiped on Render
redeploy per the caveat above), sign-in and Planner data live in a separate
Supabase project (hosted Postgres + auth) and are unaffected by Render
redeploys/restarts entirely.

Setup:

1. Create a free project at supabase.com.
2. In the project's SQL Editor, run `supabase-schema.sql` from this repo once
   -- creates the `planner_terms`/`planner_courses` tables with Row Level
   Security policies so each user can only ever see their own rows.
3. From Project Settings -> API, copy the Project URL and the publishable
   (anon) key -- never the secret/service_role key, which must never be
   exposed to the browser.
4. Set two environment variables wherever the server runs (Render: service ->
   Environment): `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The server exposes
   these to the frontend via `/api/config` (safe to expose -- the anon key
   only works within the RLS policies above, it isn't a secret credential).
5. By default Supabase requires email confirmation on signup. For a casual/
   friend-group deployment this is worth turning off (Authentication -> Sign
   In / Providers -> Email -> "Confirm email"), since the free tier's
   outgoing email is rate-limited and several signups close together can
   leave people waiting on a confirmation email that's slow to arrive.

Without these env vars set, the app still runs fine -- sign-in/Planner UI
just stays inactive (`/api/config` returns nulls, and the frontend no-ops).

## On professor ratings

This intentionally does NOT scrape or reproduce RateMyProfessor review
content -- that's their users' content, under their ToS, and redistributing
it on a separate site is a real legal/ethical issue regardless of how easy
it'd be technically. Instead, each professor links out to a live RMP search
for their name. If you want in-app ratings later, the clean way to do it is
a native review system your own users fill in (their data, your site).

## Known limitations

- `meeting_info` is a flattened text field (day/time/location joined), not
  structured per-meeting-pattern data -- fine for display, not for e.g.
  calendar export without more parsing work
- Only tested against Fall 2026; term-to-term formatting quirks in Banner's
  output are possible and not all have been hit yet
- No auth/accounts -- it's read-only search, nothing personal is stored
