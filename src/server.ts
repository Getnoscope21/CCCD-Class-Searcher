import express from 'express';
import path from 'node:path';
import { assistTransferabilityUrl } from './assist-links';
import db from './db';
import { REQUIREMENT_CATEGORIES } from './ge-requirements';
import { COLLEGES } from './scraper';
import type {
  CollegeCode,
  CourseCatalog,
  CourseSection,
  Modality,
  RatingSummary,
  SqlValue,
} from './types';

const app = express();
const clientBuildDir = path.resolve(__dirname, 'client');
app.use(express.static(clientBuildDir));
app.use(express.json());

// Supabase URL + anon key are safe to expose to the browser (the anon key is
// meant to be public -- real access control happens via Row Level Security
// policies in Supabase, not by hiding this key). Frontend fetches this once
// on load instead of the values being hardcoded into committed JS.
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
  });
});

function modalityOf(location: string | null | undefined): Modality {
  const loc = (location || '').toUpperCase();
  if (loc.includes('LIVEONLINE')) return 'Live Online';
  if (loc.includes('ONLINE')) return 'Online';
  if (!loc.trim()) return 'TBA';
  return 'In-Person';
}

function ratingsSummary(): Map<string, RatingSummary> {
  // Map of "instructor|college" -> { avg_rating, rating_count }
  const rows = db.prepare(
    `SELECT instructor, college, ROUND(AVG(rating), 1) as avg_rating, COUNT(*) as rating_count
     FROM ratings GROUP BY instructor, college`
  ).all() as RatingSummary[];
  const map = new Map<string, RatingSummary>();
  for (const r of rows) map.set(`${r.instructor}|${r.college}`, r);
  return map;
}

function attachRating<T extends Pick<CourseSection, 'instructor' | 'college'>>(
  row: T,
  ratingsMap: Map<string, RatingSummary>,
) {
  const r = ratingsMap.get(`${row.instructor}|${row.college}`);
  return { ...row, avg_rating: r ? r.avg_rating : null, rating_count: r ? r.rating_count : 0 };
}

function defaultTerm(): string | null {
  const row = db.prepare(`SELECT term FROM courses ORDER BY term DESC LIMIT 1`).get() as
    | { term: string }
    | undefined;
  return row ? row.term : null;
}

// Pulls the first clock time out of a meeting_info blob (e.g. "T 09:00am - 11:00am ...")
// so cards/sections can be sorted by time-of-day. Arranged-hours-only sections have no
// clock time and sort last.
function earliestStartMinutes(meetingInfo: string | null | undefined): number | null {
  const m = (meetingInfo || '').match(/\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i);
  if (!m) return null;
  const hours = Number(m[1]) % 12;
  const normalizedHours = m[3]?.toLowerCase() === 'pm' ? hours + 12 : hours;
  return normalizedHours * 60 + Number(m[2]);
}

function parseDateRangeStart(dateRange: string | null | undefined): number | null {
  // "08/24-12/12" -> sortable MMDD number; missing/blank sorts last via caller
  const m = (dateRange || '').match(/^(\d{2})\/(\d{2})/);
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
}

function catalogMap(term: string): Map<string, CourseCatalog> {
  const rows = db.prepare(
    `SELECT college, subject, course_number, description, corequisites, transfer_credit
     FROM course_catalog WHERE term = ?`
  ).all(term) as CourseCatalog[];
  const map = new Map<string, CourseCatalog>();
  for (const r of rows) map.set(`${r.college}|${r.subject}|${r.course_number}`, r);
  return map;
}

interface RequirementCount {
  college: CollegeCode;
  subject: string;
  course_number: string;
  n: number;
}

type Query = Record<string, string | undefined>;

interface CourseGroup {
  college: CollegeCode;
  subject: string;
  course_number: string;
  title: string;
  term: string;
  term_desc: string | null;
  sections: CourseSection[];
}

interface CourseCard {
  college: CollegeCode;
  subject: string;
  course_number: string;
  title: string;
  term: string;
  term_desc: string | null;
  section_count: number;
  units_min: number | null;
  units_max: number | null;
  open_count: number;
  closed_count: number;
  waitlist_count: number;
  seats_available: number;
  avg_rating: number | null;
  rating_count: number;
  requirement_count: number;
  earliest_start_minutes: number | null;
  earliest_start_date: number | null;
  description: string | null;
}

interface InstructorRow {
  instructor: string;
  college: CollegeCode;
  section_count: number;
}

interface RatingRow {
  rating: number;
  comment: string | null;
  created_at: string;
}

interface CourseRequirement {
  id: number;
  requirement_text: string;
  created_at: string;
}

function requirementCounts(): Map<string, number> {
  const rows = db.prepare(
    `SELECT college, subject, course_number, COUNT(*) as n FROM course_requirements
     GROUP BY college, subject, course_number`
  ).all() as RequirementCount[];
  const map = new Map<string, number>();
  for (const r of rows) map.set(`${r.college}|${r.subject}|${r.course_number}`, r.n);
  return map;
}

app.get('/api/colleges', (req, res) => {
  res.json(Object.entries(COLLEGES).map(([code, name]) => ({ code, name })));
});

app.get('/api/terms', (req, res) => {
  const rows = db.prepare(
    `SELECT DISTINCT term, term_desc FROM courses ORDER BY term DESC`
  ).all();
  res.json(rows);
});

app.get('/api/subjects', (req, res) => {
  const { college, term } = req.query as Query;
  let sql = `SELECT DISTINCT subject FROM courses WHERE 1=1`;
  const params: SqlValue[] = [];
  if (college) { sql += ` AND college = ?`; params.push(college); }
  if (term) { sql += ` AND term = ?`; params.push(term); }
  sql += ` ORDER BY subject`;
  const rows = db.prepare(sql).all(...params) as Array<{ subject: string }>;
  res.json(rows.map((row) => row.subject));
});

app.get('/api/search', (req, res) => {
  const { q, college, subject, instructor, term, open_only, modality } = req.query as Query;
  let sql = `SELECT * FROM courses WHERE 1=1`;
  const params: SqlValue[] = [];

  if (term) { sql += ` AND term = ?`; params.push(term); }
  if (college) { sql += ` AND college = ?`; params.push(college); }
  if (subject) { sql += ` AND subject = ?`; params.push(subject); }
  if (instructor) { sql += ` AND instructor LIKE ?`; params.push(`%${instructor}%`); }
  if (open_only === 'true') { sql += ` AND status NOT IN ('CLOSED', 'Waitlisted')`; }
  if (q) {
    sql += ` AND (subject LIKE ? OR course_number LIKE ? OR title LIKE ? OR instructor LIKE ? OR crn LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (modality === 'Live Online') { sql += ` AND UPPER(location) LIKE '%LIVEONLINE%'`; }
  else if (modality === 'Online') { sql += ` AND UPPER(location) LIKE '%ONLINE%' AND UPPER(location) NOT LIKE '%LIVEONLINE%'`; }
  else if (modality === 'TBA') { sql += ` AND (location IS NULL OR TRIM(location) = '')`; }
  else if (modality === 'In-Person') { sql += ` AND TRIM(location) != '' AND UPPER(location) NOT LIKE '%ONLINE%'`; }
  sql += ` ORDER BY subject, course_number, crn LIMIT 500`;

  const ratingsMap = ratingsSummary();
  const sections = db.prepare(sql).all(...params) as CourseSection[];
  const rows = sections.map((section) => ({ ...section, modality: modalityOf(section.location) }));
  res.json(rows.map((r) => attachRating(r, ratingsMap)));
});

app.get('/api/ge-requirements', (req, res) => {
  res.json(REQUIREMENT_CATEGORIES.map(({ key, label }) => ({ key, label })));
});

app.get('/api/course-cards', (req, res) => {
  const query = req.query as Query;
  const { q, college, subject, modality, statuses, units_min, units_max, sort, requirement } = query;
  const term = query.term || defaultTerm();
  if (!term) return res.json([]);

  let sql = `SELECT * FROM courses WHERE term = ?`;
  const params: SqlValue[] = [term];
  if (college) { sql += ` AND college = ?`; params.push(college); }
  if (subject) { sql += ` AND subject = ?`; params.push(subject); }
  if (statuses) {
    const list = statuses.split(',').filter(Boolean);
    if (list.length) { sql += ` AND status IN (${list.map(() => '?').join(',')})`; params.push(...list); }
  }
  if (q) {
    sql += ` AND (subject LIKE ? OR course_number LIKE ? OR title LIKE ? OR instructor LIKE ? OR crn LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (modality === 'Live Online') { sql += ` AND UPPER(location) LIKE '%LIVEONLINE%'`; }
  else if (modality === 'Online') { sql += ` AND UPPER(location) LIKE '%ONLINE%' AND UPPER(location) NOT LIKE '%LIVEONLINE%'`; }
  else if (modality === 'TBA') { sql += ` AND (location IS NULL OR TRIM(location) = '')`; }
  else if (modality === 'In-Person') { sql += ` AND TRIM(location) != '' AND UPPER(location) NOT LIKE '%ONLINE%'`; }

  const unitsMin = units_min !== undefined && units_min !== '' ? Number(units_min) : null;
  const unitsMax = units_max !== undefined && units_max !== '' ? Number(units_max) : null;
  if (unitsMin !== null) { sql += ` AND CAST(credits AS REAL) >= ?`; params.push(unitsMin); }
  if (unitsMax !== null) { sql += ` AND CAST(credits AS REAL) <= ?`; params.push(unitsMax); }

  let rows = db.prepare(sql).all(...params) as CourseSection[];

  if (requirement) {
    const category = REQUIREMENT_CATEGORIES.find((c) => c.key === requirement);
    if (category) {
      const tagRows = db.prepare(
        `SELECT DISTINCT college, subject, course_number FROM course_ge_tags
         WHERE term = ? AND code IN (${category.codes.map(() => '?').join(',')})`
      ).all(term, ...category.codes) as Array<Pick<CourseSection, 'college' | 'subject' | 'course_number'>>;
      const allowed = new Set(tagRows.map((t) => `${t.college}|${t.subject}|${t.course_number}`));
      rows = rows.filter((r) => allowed.has(`${r.college}|${r.subject}|${r.course_number}`));
    }
  }

  const ratingsMap = ratingsSummary();
  const catalog = catalogMap(term);
  const reqCounts = requirementCounts();

  const groups = new Map<string, CourseGroup>();
  for (const r of rows) {
    const key = `${r.college}|${r.subject}|${r.course_number}`;
    if (!groups.has(key)) {
      groups.set(key, {
        college: r.college, subject: r.subject, course_number: r.course_number,
        title: r.title, term, term_desc: r.term_desc,
        sections: [],
      });
    }
    groups.get(key)?.sections.push(r);
  }

  const cards: CourseCard[] = [...groups.values()].map((g) => {
    const key = `${g.college}|${g.subject}|${g.course_number}`;
    const sections = g.sections;
    const units = sections.map((s) => Number(s.credits)).filter((n) => !Number.isNaN(n));
    const openCount = sections.filter((s) => s.status === 'OPEN').length;
    const closedCount = sections.filter((s) => s.status === 'CLOSED').length;
    const waitlistCount = sections.filter((s) => s.status === 'Waitlisted').length;
    const seatsAvailable = sections.reduce((sum, s) => sum + Math.max(0, (s.cap ?? 0) - (s.act ?? 0)), 0);

    const instructorRatings = [...new Set(sections.map((s) => s.instructor).filter(Boolean))]
      .map((name) => ratingsMap.get(`${name}|${g.college}`))
      .filter((rating): rating is RatingSummary => rating !== undefined);
    const ratingCount = instructorRatings.reduce((sum, r) => sum + r.rating_count, 0);
    const avgRating = ratingCount > 0
      ? Math.round((instructorRatings.reduce((sum, r) => sum + r.avg_rating * r.rating_count, 0) / ratingCount) * 10) / 10
      : null;

    const startMinutes = sections.map((s) => earliestStartMinutes(s.meeting_info)).filter((n) => n != null);
    const startDates = sections.map((s) => parseDateRangeStart(s.date_range)).filter((n) => n != null);
    const cat = catalog.get(key);

    return {
      college: g.college, subject: g.subject, course_number: g.course_number,
      title: g.title, term, term_desc: g.term_desc,
      section_count: sections.length,
      units_min: units.length ? Math.min(...units) : null,
      units_max: units.length ? Math.max(...units) : null,
      open_count: openCount, closed_count: closedCount, waitlist_count: waitlistCount,
      seats_available: seatsAvailable,
      avg_rating: avgRating, rating_count: ratingCount,
      requirement_count: reqCounts.get(key) || 0,
      earliest_start_minutes: startMinutes.length ? Math.min(...startMinutes) : null,
      earliest_start_date: startDates.length ? Math.min(...startDates) : null,
      description: cat ? cat.description : null,
    };
  });

  const qLower = (q || '').toLowerCase().trim();
  const sorters: Record<string, (a: CourseCard, b: CourseCard) => number> = {
    relevance: (a: CourseCard, b: CourseCard) => {
      if (qLower) {
        const aCode = `${a.subject} ${a.course_number}`.toLowerCase();
        const bCode = `${b.subject} ${b.course_number}`.toLowerCase();
        const aStarts = aCode.startsWith(qLower) ? 0 : 1;
        const bStarts = bCode.startsWith(qLower) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
      }
      return a.subject.localeCompare(b.subject) || a.course_number.localeCompare(b.course_number);
    },
    units: (a, b) => (a.units_min ?? 99) - (b.units_min ?? 99),
    rating: (a, b) => (b.avg_rating ?? -1) - (a.avg_rating ?? -1),
    seats: (a, b) => b.seats_available - a.seats_available,
    requirements: (a, b) => b.requirement_count - a.requirement_count,
    semester: (a, b) => (a.term_desc || '').localeCompare(b.term_desc || ''),
    datetime: (a, b) => {
      const aVal = a.earliest_start_minutes ?? 9999;
      const bVal = b.earliest_start_minutes ?? 9999;
      return aVal - bVal;
    },
  };
  const selectedSorter = (sort && sorters[sort]) || sorters.relevance;
  if (selectedSorter) cards.sort(selectedSorter);

  res.json(cards.slice(0, 300));
});

app.get('/api/course/:college/:subject/:number', (req, res) => {
  const { college, subject, number } = req.params;
  const term = (req.query as Query).term || defaultTerm();
  if (!term) return res.status(404).json({ error: 'No course terms are available' });
  const sections = db.prepare(
    `SELECT * FROM courses WHERE college = ? AND subject = ? AND course_number = ? AND term = ?
     ORDER BY crn`
  ).all(college, subject, number, term) as CourseSection[];

  const ratingsMap = ratingsSummary();
  const cat = db.prepare(
    `SELECT description, corequisites, transfer_credit FROM course_catalog
     WHERE college = ? AND subject = ? AND course_number = ? AND term = ?`
  ).get(college, subject, number, term) as
    | Pick<CourseCatalog, 'description' | 'corequisites' | 'transfer_credit'>
    | undefined;
  const requirements = db.prepare(
    `SELECT id, requirement_text, created_at FROM course_requirements
     WHERE college = ? AND subject = ? AND course_number = ? ORDER BY created_at DESC`
  ).all(college, subject, number) as CourseRequirement[];

  res.json({
    college, subject, course_number: number, term,
    term_desc: sections[0]?.term_desc ?? null,
    title: sections[0] ? sections[0].title : null,
    description: cat ? cat.description : null,
    corequisites: cat ? cat.corequisites : null,
    transfer_credit: cat ? cat.transfer_credit : null,
    assist_url: assistTransferabilityUrl(college),
    sections: sections.map((s) => ({ ...attachRating({ ...s, modality: modalityOf(s.location) }, ratingsMap) })),
    requirements,
  });
});

app.post('/api/course-requirements', (req, res) => {
  const { college, subject, course_number, text } = req.body || {};
  const trimmed = (text || '').trim();
  if (!college || !subject || !course_number || !trimmed) {
    return res.status(400).json({ error: 'college, subject, course_number, and text are required' });
  }
  db.prepare(
    `INSERT INTO course_requirements (college, subject, course_number, requirement_text) VALUES (?, ?, ?, ?)`
  ).run(college, subject, course_number, trimmed.slice(0, 500));

  const requirements = db.prepare(
    `SELECT id, requirement_text, created_at FROM course_requirements
     WHERE college = ? AND subject = ? AND course_number = ? ORDER BY created_at DESC`
  ).all(college, subject, course_number);
  res.json({ requirements });
});

app.get('/api/instructors', (req, res) => {
  const { q, college, term } = req.query as Query;
  let sql = `SELECT instructor, college, COUNT(*) as section_count
             FROM courses WHERE instructor != '' AND instructor IS NOT NULL`;
  const params: SqlValue[] = [];
  if (college) { sql += ` AND college = ?`; params.push(college); }
  if (term) { sql += ` AND term = ?`; params.push(term); }
  if (q) { sql += ` AND instructor LIKE ?`; params.push(`%${q}%`); }
  sql += ` GROUP BY instructor, college ORDER BY instructor LIMIT 200`;

  const ratingsMap = ratingsSummary();
  const rows = db.prepare(sql).all(...params) as InstructorRow[];
  res.json(rows.map((r) => ({
    ...attachRating(r, ratingsMap),
    rmp_search_url: `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(r.instructor)}`,
  })));
});

app.get('/api/instructor/:name', (req, res) => {
  const { college } = req.query as Query;
  const rows = db.prepare(
    `SELECT * FROM courses WHERE instructor = ? ORDER BY term DESC, subject, course_number`
  ).all(req.params.name) as CourseSection[];
  const ratingRows = db.prepare(
    `SELECT rating, comment, created_at FROM ratings WHERE instructor = ? AND college = ? ORDER BY created_at DESC`
  ).all(req.params.name, college || rows[0]?.college || '') as RatingRow[];
  const avg = ratingRows.length
    ? Math.round((ratingRows.reduce((s, r) => s + r.rating, 0) / ratingRows.length) * 10) / 10
    : null;
  res.json({
    instructor: req.params.name,
    rmp_search_url: `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(req.params.name)}`,
    avg_rating: avg,
    rating_count: ratingRows.length,
    ratings: ratingRows,
    sections: rows.map((r) => ({ ...r, modality: modalityOf(r.location) })),
  });
});

app.post('/api/ratings', (req, res) => {
  const { instructor, college, rating, comment } = req.body || {};
  const ratingNum = Number(rating);
  if (!instructor || !college || !Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: 'instructor, college, and an integer rating 1-5 are required' });
  }
  db.prepare(`INSERT INTO ratings (instructor, college, rating, comment) VALUES (?, ?, ?, ?)`)
    .run(instructor, college, ratingNum, (comment || '').slice(0, 500));

  const summary = db.prepare(
    `SELECT ROUND(AVG(rating), 1) as avg_rating, COUNT(*) as rating_count
     FROM ratings WHERE instructor = ? AND college = ?`
  ).get(instructor, college);
  res.json(summary);
});

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  return res.sendFile(path.join(clientBuildDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GWC/OCC/Coastline Class Finder running at http://localhost:${PORT}`));
