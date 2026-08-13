import Database from "better-sqlite3";
import path from "node:path";

const db = new Database(path.resolve(__dirname, "..", "data.db"));
db.pragma("journal_mode = WAL");

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
  user_id TEXT,
  instructor TEXT NOT NULL,
  college TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ratings_instructor ON ratings(instructor, college);

CREATE TABLE IF NOT EXISTS course_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college TEXT NOT NULL,
  term TEXT NOT NULL,
  subject TEXT NOT NULL,
  course_number TEXT NOT NULL,
  description TEXT,
  corequisites TEXT,
  transfer_credit TEXT,
  updated_at TEXT,
  UNIQUE(college, term, subject, course_number)
);

CREATE TABLE IF NOT EXISTS course_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  college TEXT NOT NULL,
  subject TEXT NOT NULL,
  course_number TEXT NOT NULL,
  requirement_text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_course_requirements_course ON course_requirements(college, subject, course_number);

CREATE TABLE IF NOT EXISTS course_ge_tags (
  college TEXT NOT NULL,
  term TEXT NOT NULL,
  subject TEXT NOT NULL,
  course_number TEXT NOT NULL,
  code TEXT NOT NULL,
  PRIMARY KEY (college, term, subject, course_number, code)
);
CREATE INDEX IF NOT EXISTS idx_course_ge_tags_lookup ON course_ge_tags(term, code);
`);

// Existing deployments already have these local cache tables. SQLite cannot
// add the column inside CREATE TABLE IF NOT EXISTS, so make this migration
// idempotent while Supabase becomes the durable source of user content.
for (const statement of [
  "ALTER TABLE ratings ADD COLUMN user_id TEXT",
  "ALTER TABLE course_requirements ADD COLUMN user_id TEXT",
]) {
  try {
    db.exec(statement);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("duplicate column")
    ) {
      throw error;
    }
  }
}

export default db;
