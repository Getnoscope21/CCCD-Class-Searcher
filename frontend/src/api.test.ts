import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("API client", () => {
  it("returns the authentication availability state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            authConfigured: false,
            supabaseUrl: null,
            supabaseAnonKey: null,
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(api.config()).resolves.toEqual({
      authConfigured: false,
      supabaseUrl: null,
      supabaseAnonKey: null,
    });
  });

  it("passes course-card filters through to the API endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await api.courseCards(new URLSearchParams({ q: "ACCT", college: "OC" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/course-cards?q=ACCT&college=OC",
      undefined,
    );
  });

  it("surfaces a readable API error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Invalid rating" }), {
          status: 400,
        }),
      ),
    );

    await expect(
      api.addRating({
        instructor: "Ada Lovelace",
        college: "OC",
        rating: 6,
        comment: "",
      }),
    ).rejects.toThrow("Invalid rating");
  });

  it("requests course detail for the selected term", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          college: "OC",
          subject: "ACCT",
          course_number: "A100",
          sections: [],
          requirements: [],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.course("OC", "ACCT", "A100", "202670");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/course/OC/ACCT/A100?term=202670",
      undefined,
    );
  });

  it("reports the last-updated timestamp", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ updated_at: "2026-08-24 05:50:32" }), {
          status: 200,
        }),
      ),
    );

    await expect(api.lastUpdated()).resolves.toEqual({
      updated_at: "2026-08-24 05:50:32",
    });
  });

  it("surfaces a readable error when the contact form is not configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Not configured" }), {
          status: 503,
        }),
      ),
    );

    await expect(
      api.contact({ name: "Test", email: "test@example.com", message: "Hi" }),
    ).rejects.toThrow("Not configured");
  });

  it("posts planner courses to the conflicts endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ conflicts: [["a", "b"]] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      api.plannerConflicts([
        { key: "a", meeting_info: "M 09:00am - 10:00am" },
        { key: "b", meeting_info: "M 09:30am - 10:30am" },
      ]),
    ).resolves.toEqual({ conflicts: [["a", "b"]] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/planner/conflicts",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns a Blob from the .ics export endpoint", async () => {
    const blob = new Blob(["BEGIN:VCALENDAR"], { type: "text/calendar" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(blob, { status: 200 })),
    );

    const result = await api.plannerIcs("202670", [
      {
        crn: "1",
        subject: "MATH",
        course_number: "180",
        title: "Calc",
        meeting_info: "M 09:00am - 10:00am Room 08/24-12/12",
        location: "Room",
      },
    ]);
    expect(result).toBeInstanceOf(Blob);
  });
});
