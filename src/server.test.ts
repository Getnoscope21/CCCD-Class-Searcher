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
});
