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
});
