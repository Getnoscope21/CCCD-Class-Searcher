const express = require('express');
const path = require('path');
const db = require('./db');
const { COLLEGES } = require('./scraper');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

function modalityOf(location) {
  const loc = (location || '').toUpperCase();
  if (loc.includes('LIVEONLINE')) return 'Live Online';
  if (loc.includes('ONLINE')) return 'Online';
  if (!loc.trim()) return 'TBA';
  return 'In-Person';
}

function ratingsSummary() {
  // Map of "instructor|college" -> { avg_rating, rating_count }
  const rows = db.prepare(
    `SELECT instructor, college, ROUND(AVG(rating), 1) as avg_rating, COUNT(*) as rating_count
     FROM ratings GROUP BY instructor, college`
  ).all();
  const map = new Map();
  for (const r of rows) map.set(`${r.instructor}|${r.college}`, r);
  return map;
}

function attachRating(row, ratingsMap) {
  const r = ratingsMap.get(`${row.instructor}|${row.college}`);
  return { ...row, avg_rating: r ? r.avg_rating : null, rating_count: r ? r.rating_count : 0 };
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
  const { college, term } = req.query;
  let sql = `SELECT DISTINCT subject FROM courses WHERE 1=1`;
  const params = [];
  if (college) { sql += ` AND college = ?`; params.push(college); }
  if (term) { sql += ` AND term = ?`; params.push(term); }
  sql += ` ORDER BY subject`;
  res.json(db.prepare(sql).all(...params).map((r) => r.subject));
});

app.get('/api/search', (req, res) => {
  const { q, college, subject, instructor, term, open_only, modality } = req.query;
  let sql = `SELECT * FROM courses WHERE 1=1`;
  const params = [];

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
  const rows = db.prepare(sql).all(...params).map((r) => ({ ...r, modality: modalityOf(r.location) }));
  res.json(rows.map((r) => attachRating(r, ratingsMap)));
});

app.get('/api/instructors', (req, res) => {
  const { q, college, term } = req.query;
  let sql = `SELECT instructor, college, COUNT(*) as section_count
             FROM courses WHERE instructor != '' AND instructor IS NOT NULL`;
  const params = [];
  if (college) { sql += ` AND college = ?`; params.push(college); }
  if (term) { sql += ` AND term = ?`; params.push(term); }
  if (q) { sql += ` AND instructor LIKE ?`; params.push(`%${q}%`); }
  sql += ` GROUP BY instructor, college ORDER BY instructor LIMIT 200`;

  const ratingsMap = ratingsSummary();
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map((r) => ({
    ...attachRating(r, ratingsMap),
    rmp_search_url: `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(r.instructor)}`,
  })));
});

app.get('/api/instructor/:name', (req, res) => {
  const { college } = req.query;
  const rows = db.prepare(
    `SELECT * FROM courses WHERE instructor = ? ORDER BY term DESC, subject, course_number`
  ).all(req.params.name);
  const ratingRows = db.prepare(
    `SELECT rating, comment, created_at FROM ratings WHERE instructor = ? AND college = ? ORDER BY created_at DESC`
  ).all(req.params.name, college || (rows[0] && rows[0].college) || '');
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GWC/OCC/Coastline Class Finder running at http://localhost:${PORT}`));
