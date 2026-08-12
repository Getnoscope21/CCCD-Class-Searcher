# Coast Colleges Class Finder

A class + professor search tool for Golden West College, Orange Coast College, and
Coastline Community College (all Coast Community College District), pulling live
data from the district's own public schedule search system.

## What it does

- Browse classes as course cards (grouped by subject + number), with a sidebar
  to filter by units, enrollment status, college, subject, and modality, and
  sort by relevance, units, rating, seats, requirements, semester, or time
- Click a course card for its real catalog description, corequisites, every
  section (CRN/instructor/meeting time/seats/status), and user-submitted
  "requirements" notes
- Browse/search professors, with a native student rating system plus a link
  out to a RateMyProfessor search (no scraping of RMP content -- see note below)

## Data source

`ssb-prod.ec.cccd.edu` -- CCCD's public Banner self-service schedule search, the
same system all three colleges link to from their own "Class Schedule" pages.
It's a public, unauthenticated system with no bot protection, intended for
prospective students to browse. `scraper.js` submits the same search form the
public website form does and parses the results table.

## Setup

```
npm install
node scraper.js 202670 "Fall 2026"   # populates data.db -- rerun periodically to refresh
node server.js                        # starts the web app on :3000
```

Then open `http://localhost:3000`.

## Refreshing data

Course data (seats, status, open/closed) changes throughout registration.
Re-run `node scraper.js <term> "<term desc>"` on a schedule (e.g. a cron job
every few hours) to keep it current. Term codes come from the college's own
"Class Schedule" page dropdown (format: YYYYNN, e.g. `202670` = Fall 2026).

## Deploying publicly

This is a plain Node/Express app with a local SQLite file -- it'll run on
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
   - Build command: `npm install`
   - Start command: `node server.js`
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
is the simpler and more reliable option -- just `git clone`, `npm install`,
`crontab` the same refresh commands from the section above, and run the
server behind a process manager like `pm2` or a systemd unit.

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
