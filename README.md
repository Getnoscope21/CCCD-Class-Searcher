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
- A Planner tab to sketch out a multi-semester schedule: sign in, add a
  specific section to semesters you create, see per-semester and total unit
  counts. Accounts and planner data live in Supabase (a hosted Postgres +
  auth service), tied to your login rather than one browser/device
  - Flags schedule conflicts -- two planned sections in the same semester
    with an overlapping day/time (parsed from `meeting_info`, see
    `src/meeting-parser.ts`)
  - Exports a semester's timed sections as a `.ics` calendar file
- Star icon on any course card to favorite it (stored in the browser's
  `localStorage`, no sign-in needed) and a "Favorites only" filter
- "🔔 Notify me" on any closed/waitlisted section for a one-time email as
  soon as it opens back up (requires SMTP + a Supabase service role key --
  see "Seat alerts and the contact form" below)
- A Contact tab that forwards a name/email/message to whoever runs this
  deployment (requires SMTP -- see below)
- Search/filter state (query, college, requirement, modality, units, status,
  sort, favorites-only) and the active tab are mirrored into the URL, so a
  search can be bookmarked or shared as a link
- "Class data updated N minutes ago" in the header, from the most recent
  scrape timestamp

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

This is a TypeScript Node/Express app with a React + Vite frontend and a local
SQLite file -- it'll run on
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
   course/seat data isn't affected, since it's baked into each deploy via the
   committed `data.db` rather than written at runtime.

For local UI development, `npm run dev` starts the Express API on port 3000 and
the Vite development server on port 5173. Vite proxies `/api` requests to the
local API server. Production remains a single Express process: `npm run build`
creates the React bundle and `npm start` serves it.

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

### Seat alerts and the contact form (SMTP)

Both features send email via `src/mailer.ts` (nodemailer). Set these env
vars wherever the server runs (Render: service -> Environment) to enable it
-- without them, the Contact tab shows a clear "not set up" error and seat
alerts silently stay unsent (same graceful-degradation pattern as everything
else here):

- `SMTP_HOST`, `SMTP_PORT` (587 by default; 465 is treated as implicit TLS),
  `SMTP_USER`, `SMTP_PASS` -- credentials for any SMTP provider (a free tier
  from Resend/Brevo/Mailgun/etc, or Gmail with an
  [app password](https://myaccount.google.com/apppasswords))
- `MAIL_FROM` -- the From address (defaults to `SMTP_USER`)
- `CONTACT_TO_EMAIL` -- where contact-form submissions land (defaults to
  `MAIL_FROM`)

Seat alerts additionally need the scraper job (not the web server) to be
able to read and clear alert subscriptions, which requires Supabase's
**service role** key -- unlike the anon key, this bypasses Row Level
Security, so it must only ever be set as a secret on the scraper's own
environment (a GitHub Actions secret with the free-hosting setup above),
never on anything reachable from a browser:

- `SUPABASE_SERVICE_ROLE_KEY` -- Project Settings -> API -> `service_role`
  secret (not the anon/publishable key)

With the GitHub Actions refresh workflow, add `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and the SMTP vars above as repo secrets
(Settings -> Secrets and variables -> Actions) -- `refresh.yml` already wires
them into the scrape step's environment, so nothing else to configure.

## On professor ratings

This intentionally does NOT scrape or reproduce RateMyProfessor review
content -- that's their users' content, under their ToS, and redistributing
it on a separate site is a real legal/ethical issue regardless of how easy
it'd be technically. Instead, each professor links out to a live RMP search
for their name. If you want in-app ratings later, the clean way to do it is
a native review system your own users fill in (their data, your site).

## Known limitations

- `meeting_info` is a flattened text field (day/time/location joined), not
  structured per-meeting-pattern data. `src/meeting-parser.ts` regex-parses
  it for conflict detection and `.ics` export, which covers the common
  "M W 9:30am - 10:55am Room 08/24-12/12" shape but skips segments it can't
  parse (arranged hours, TBA times) -- those just don't get a conflict check
  or a calendar event
- `.ics` export assumes the term's 4-digit year applies to every date in its
  date ranges (fine for a normal fall/spring term, not verified across a
  term that spans a year boundary)
- There is no `prerequisites` field in this codebase's `course_catalog`
  schema (it existed in an earlier version and was dropped during a rewrite),
  so there's no "is this course's prerequisite scheduled in an earlier
  semester?" warning in the Planner -- would need prerequisite scraping/
  storage/UI added back as a separate piece of work
- Only tested against Fall 2026; term-to-term formatting quirks in Banner's
  output are possible and not all have been hit yet
- Ratings and course-requirement notes are intentionally lightweight and
  unauthenticated; planner accounts and saved plans use Supabase authentication
- Favorites are stored per-browser (`localStorage`), not tied to an account
  like the Planner is -- they don't follow you across devices
