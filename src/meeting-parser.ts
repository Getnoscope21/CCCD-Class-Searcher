// Parses the flattened `meeting_info` text CCCD's schedule search returns
// (see scraper.ts's parseCatalog) into structured day/time/location patterns,
// used for planner schedule-conflict detection and .ics calendar export.
// Segments with no clock time (arranged hours, online-async) are skipped --
// there's nothing to conflict-check or put on a calendar for those.

const DAY_TOKEN = "(?:Su|Sa|Th|M|T|W|F)";
const SEGMENT_RE = new RegExp(
  `^((?:${DAY_TOKEN})(?:\\s+${DAY_TOKEN})*)\\s+(\\d{1,2}:\\d{2}\\s*(?:am|pm))\\s*-\\s*(\\d{1,2}:\\d{2}\\s*(?:am|pm))\\s*(.*?)\\s*(\\d{2}/\\d{2}-\\d{2}/\\d{2})?$`,
  "i",
);

const ICS_DAY: Record<string, string> = {
  M: "MO",
  T: "TU",
  W: "WE",
  Th: "TH",
  F: "FR",
  Sa: "SA",
  Su: "SU",
};
const JS_DAY: Record<string, number> = {
  Su: 0,
  M: 1,
  T: 2,
  W: 3,
  Th: 4,
  F: 5,
  Sa: 6,
};

function clockToMinutes(clock: string | undefined): number | null {
  const m = (clock || "").match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) return null;
  const hours = Number(m[1]) % 12;
  const normalizedHours = m[3]?.toLowerCase() === "pm" ? hours + 12 : hours;
  return normalizedHours * 60 + Number(m[2]);
}

export interface MeetingDateRange {
  start: string;
  end: string;
}

export interface MeetingPattern {
  days: string[];
  startMin: number;
  endMin: number;
  location: string;
  dateRange: MeetingDateRange | null;
}

export function parseMeetingPatterns(
  meetingInfo: string | null | undefined,
): MeetingPattern[] {
  if (!meetingInfo) return [];
  const segments = meetingInfo
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  const patterns: MeetingPattern[] = [];
  for (const seg of segments) {
    const m = seg.match(SEGMENT_RE);
    if (!m) continue;
    const startMin = clockToMinutes(m[2]);
    const endMin = clockToMinutes(m[3]);
    if (startMin == null || endMin == null) continue;
    const days = (m[1] ?? "").trim().split(/\s+/);
    const location = (m[4] || "").trim();
    const dateRangeMatch = m[5];
    const dateRange: MeetingDateRange | null = dateRangeMatch
      ? {
          start: dateRangeMatch.split("-")[0] ?? "",
          end: dateRangeMatch.split("-")[1] ?? "",
        }
      : null;
    patterns.push({ days, startMin, endMin, location, dateRange });
  }
  return patterns;
}

export function patternsOverlap(a: MeetingPattern, b: MeetingPattern): boolean {
  const sharedDay = a.days.some((d) => b.days.includes(d));
  if (!sharedDay) return false;
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

// Any timed pattern of course A overlaps any timed pattern of course B.
export function meetingsConflict(
  meetingInfoA: string | null | undefined,
  meetingInfoB: string | null | undefined,
): boolean {
  const a = parseMeetingPatterns(meetingInfoA);
  const b = parseMeetingPatterns(meetingInfoB);
  for (const pa of a)
    for (const pb of b) if (patternsOverlap(pa, pb)) return true;
  return false;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function icsDate(year: number, month: number, day: number): string {
  return `${year}${pad2(month)}${pad2(day)}`;
}

function firstOccurrenceOnOrAfter(
  year: number,
  startMD: string,
  targetJsDow: number,
): Date {
  const [mm, dd] = startMD.split("/").map(Number);
  const d = new Date(Date.UTC(year, (mm ?? 1) - 1, dd ?? 1));
  while (d.getUTCDay() !== targetJsDow) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/[;,]/g, (c) => "\\" + c)
    .replace(/\n/g, "\\n");
}

export interface IcsCourse {
  crn?: string | null;
  subject: string;
  course_number: string;
  title?: string | null;
  meeting_info: string | null;
  location?: string | null;
}

// courses: sections to place on the calendar.
// term: CCCD term code, e.g. "202670" -- first 4 digits are the calendar year.
export function buildIcsForCourses(courses: IcsCourse[], term: string): string {
  const year =
    Number(String(term || "").slice(0, 4)) || new Date().getFullYear();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Coast Colleges Class Finder//Planner//EN",
    "CALSCALE:GREGORIAN",
  ];
  let uid = 0;

  for (const c of courses) {
    const patterns = parseMeetingPatterns(c.meeting_info);
    for (const p of patterns) {
      if (!p.dateRange) continue;
      const [endDateMonth, endDateDay] = p.dateRange.end.split("/").map(Number);
      for (const dayTok of p.days) {
        const jsDow = JS_DAY[dayTok];
        const icsDay = ICS_DAY[dayTok];
        if (jsDow === undefined || !icsDay) continue;
        const start = firstOccurrenceOnOrAfter(year, p.dateRange.start, jsDow);
        const startHH = Math.floor(p.startMin / 60);
        const startMM = p.startMin % 60;
        const endHH = Math.floor(p.endMin / 60);
        const endMM = p.endMin % 60;
        const datePart = icsDate(
          year,
          start.getUTCMonth() + 1,
          start.getUTCDate(),
        );
        const dtStart = `${datePart}T${pad2(startHH)}${pad2(startMM)}00`;
        const dtEnd = `${datePart}T${pad2(endHH)}${pad2(endMM)}00`;
        const until = `${icsDate(year, endDateMonth ?? start.getUTCMonth() + 1, endDateDay ?? start.getUTCDate())}T235900Z`;
        uid++;
        lines.push(
          "BEGIN:VEVENT",
          `UID:${c.crn || "x"}-${dayTok}-${uid}@coastcollegesclassfinder`,
          `DTSTART:${dtStart}`,
          `DTEND:${dtEnd}`,
          `RRULE:FREQ=WEEKLY;BYDAY=${icsDay};UNTIL=${until}`,
          `SUMMARY:${escapeIcsText(`${c.subject} ${c.course_number}${c.title ? " - " + c.title : ""}`)}`,
        );
        if (p.location) lines.push(`LOCATION:${escapeIcsText(p.location)}`);
        lines.push("END:VEVENT");
      }
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
