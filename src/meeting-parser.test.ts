import { describe, expect, it } from "vitest";
import {
  buildIcsForCourses,
  meetingsConflict,
  parseMeetingPatterns,
} from "./meeting-parser";

describe("parseMeetingPatterns", () => {
  it("parses a simple day/time segment with no location or date range", () => {
    expect(parseMeetingPatterns("M W 09:30am - 10:55am")).toEqual([
      {
        days: ["M", "W"],
        startMin: 570,
        endMin: 655,
        location: "",
        dateRange: null,
      },
    ]);
  });

  it("parses location and date range when present", () => {
    expect(
      parseMeetingPatterns("T 09:00am - 11:00am Technology 209 08/24-12/12"),
    ).toEqual([
      {
        days: ["T"],
        startMin: 540,
        endMin: 660,
        location: "Technology 209",
        dateRange: { start: "08/24", end: "12/12" },
      },
    ]);
  });

  it("skips segments with no clock time (arranged hours)", () => {
    expect(
      parseMeetingPatterns(
        "3.4 Hrs/Wk arr in addition to any scheduled hrs if applicable",
      ),
    ).toEqual([]);
  });

  it("returns an empty array for null/undefined/empty input", () => {
    expect(parseMeetingPatterns(null)).toEqual([]);
    expect(parseMeetingPatterns(undefined)).toEqual([]);
    expect(parseMeetingPatterns("")).toEqual([]);
  });
});

describe("meetingsConflict", () => {
  it("detects an overlapping time on a shared day", () => {
    expect(
      meetingsConflict(
        "M W 09:30am - 10:55am",
        "M 10:00am - 11:00am Room 08/24-12/12",
      ),
    ).toBe(true);
  });

  it("does not flag non-overlapping days as a conflict", () => {
    expect(meetingsConflict("M 09:30am - 10:55am", "T 09:30am - 10:55am")).toBe(
      false,
    );
  });

  it("does not flag back-to-back (non-overlapping) times as a conflict", () => {
    expect(meetingsConflict("M 09:00am - 10:00am", "M 10:00am - 11:00am")).toBe(
      false,
    );
  });
});

describe("buildIcsForCourses", () => {
  it("builds one weekly recurring VEVENT per meeting day", () => {
    const ics = buildIcsForCourses(
      [
        {
          crn: "12345",
          subject: "MATH",
          course_number: "180",
          title: "Calc",
          meeting_info: "M W 09:30am - 10:55am Room 101 08/24-12/12",
        },
      ],
      "202670",
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("DTSTART:20260824T093000");
    expect(ics).toContain("DTEND:20260824T105500");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261212T235900Z");
    expect(ics).toContain("DTSTART:20260826T093000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20261212T235900Z");
    expect(ics).toContain("SUMMARY:MATH 180 - Calc");
    expect(ics).toContain("LOCATION:Room 101");
  });

  it("omits sections with no meeting date range from the calendar", () => {
    const ics = buildIcsForCourses(
      [
        {
          crn: "1",
          subject: "MATH",
          course_number: "180",
          meeting_info: "M 09:00am - 10:00am",
        },
      ],
      "202670",
    );
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("returns a valid empty calendar for no courses", () => {
    expect(buildIcsForCourses([], "202670")).toBe(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Coast Colleges Class Finder//Planner//EN\r\nCALSCALE:GREGORIAN\r\nEND:VCALENDAR",
    );
  });
});
