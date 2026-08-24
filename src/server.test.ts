import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./server";

describe("server API", () => {
  it("reports application and database health", async () => {
    await request(app).get("/healthz").expect(200, { status: "ok" });
    await request(app)
      .get("/readyz")
      .expect(200, { status: "ready", database: "ok" });
  });

  it("reports authentication availability without partial configuration", async () => {
    const response = await request(app).get("/api/config").expect(200);
    expect(response.body.authConfigured).toBe(
      Boolean(response.body.supabaseUrl && response.body.supabaseAnonKey),
    );
    if (!response.body.authConfigured) {
      expect(response.body.supabaseUrl).toBeNull();
      expect(response.body.supabaseAnonKey).toBeNull();
    }
  });

  it("rejects malformed course-card filters with readable errors", async () => {
    const invalidUnits = await request(app)
      .get("/api/course-cards")
      .query({ units_min: "many" })
      .expect(400);
    expect(invalidUnits.body.error).toBe("Units must be between 0 and 99");

    const reversedRange = await request(app)
      .get("/api/course-cards")
      .query({ units_min: "4", units_max: "2" })
      .expect(400);
    expect(reversedRange.body.error).toBe(
      "Minimum units cannot exceed maximum units",
    );

    await request(app)
      .get("/api/course-cards")
      .query({ statuses: "OPEN,Imaginary" })
      .expect(400, { error: "Unknown course status" });

    await request(app)
      .get("/api/course-cards?college=GW&college=OC")
      .expect(400, { error: "Query parameters must be singular" });
  });

  it("returns 404 for courses that do not exist", async () => {
    await request(app)
      .get("/api/course/GW/NOT-A-SUBJECT/99999")
      .expect(404, { error: "Course not found" });
  });

  it("rejects non-string user content instead of throwing", async () => {
    await request(app)
      .post("/api/course-requirements")
      .send({
        college: "GW",
        subject: "ACCT",
        course_number: "G100",
        text: { unexpected: true },
      })
      .expect(400);

    await request(app)
      .post("/api/ratings")
      .send({
        instructor: "Test Instructor",
        college: "GW",
        rating: 5,
        comment: { unexpected: true },
      })
      .expect(400);
  });

  it("limits instructor detail sections to the requested college", async () => {
    const response = await request(app)
      .get(`/api/instructor/${encodeURIComponent("Alice Burger")}`)
      .query({ college: "CL" })
      .expect(200);

    expect(response.body.sections.length).toBeGreaterThan(0);
    expect(
      response.body.sections.every(
        (section: { college: string }) => section.college === "CL",
      ),
    ).toBe(true);
  });

  it("returns JSON for malformed JSON request bodies", async () => {
    await request(app)
      .post("/api/ratings")
      .set("Content-Type", "application/json")
      .send("{not-json")
      .expect(400, { error: "Request body must be valid JSON" });
  });

  it("reports the most recent course refresh timestamp", async () => {
    const response = await request(app).get("/api/last-updated").expect(200);
    expect(response.body).toHaveProperty("updated_at");
  });

  it("flags overlapping planner sections but not distinct-day ones", async () => {
    const conflicting = await request(app)
      .post("/api/planner/conflicts")
      .send({
        courses: [
          { key: "a", meeting_info: "M W 09:30am - 10:55am" },
          { key: "b", meeting_info: "M 10:00am - 11:00am Room 08/24-12/12" },
        ],
      })
      .expect(200);
    expect(conflicting.body.conflicts).toEqual([["a", "b"]]);

    const clear = await request(app)
      .post("/api/planner/conflicts")
      .send({
        courses: [
          { key: "a", meeting_info: "M 09:30am - 10:55am" },
          { key: "b", meeting_info: "T 09:30am - 10:55am" },
        ],
      })
      .expect(200);
    expect(clear.body.conflicts).toEqual([]);
  });

  it("builds a downloadable .ics calendar for a planner semester", async () => {
    const response = await request(app)
      .post("/api/planner/ics")
      .send({
        term: "202670",
        courses: [
          {
            crn: "12345",
            subject: "MATH",
            course_number: "180",
            title: "Calc",
            meeting_info: "M W 09:30am - 10:55am Room 101 08/24-12/12",
          },
        ],
      })
      .expect(200);
    expect(response.headers["content-type"]).toContain("text/calendar");
    expect(response.text).toContain("BEGIN:VCALENDAR");
    expect(response.text).toContain("SUMMARY:MATH 180 - Calc");
  });

  it("rejects a planner .ics export missing term or courses", async () => {
    await request(app)
      .post("/api/planner/ics")
      .send({ courses: [] })
      .expect(400, { error: "term and courses are required" });
  });

  it("requires a name, valid email, and message on the contact form", async () => {
    await request(app)
      .post("/api/contact")
      .send({ name: "", email: "not-an-email", message: "" })
      .expect(400, {
        error: "Name, a valid email, and a message are required.",
      });
  });

  it("reports contact form as unavailable when SMTP is not configured", async () => {
    await request(app)
      .post("/api/contact")
      .send({ name: "Test", email: "test@example.com", message: "Hello" })
      .expect(503);
  });
});
