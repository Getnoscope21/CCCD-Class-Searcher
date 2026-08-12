const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college TEXT NOT NULL,
  term TEXT NOT NULL,
  term_desc TEXT,
  subject TEXT,
  course_number TEXT,
  title TEXT,
  crn TEXT NOT NULL,
  status TEXT,
  credits TEXT,
  meeting_info TEXT,
  location TEXT,
  cap INTEGER,
  act INTEGER,
  wl_cap INTEGER,
  wl_act INTEGER,
  instructor TEXT,
  date_range TEXT,
  weeks TEXT,
  updated_at TEXT,
  UNIQUE(college, term, crn)
);
CREATE INDEX IF NOT EXISTS idx_courses_subject ON courses(college, term, subject);
CREATE INDEX IF NOT EXISTS idx_courses_instructor ON courses(instructor);
CREATE INDEX IF NOT EXISTS idx_courses_title ON courses(title);

CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instructor TEXT NOT NULL,
  college TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ratings_instructor ON ratings(instructor, college);
`);

module.exports = db;
