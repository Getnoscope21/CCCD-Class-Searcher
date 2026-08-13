import { afterEach, describe, expect, it, vi } from "vitest";
import { api, setAccessToken } from "./api";

afterEach(() => {
  setAccessToken(null);
  vi.unstubAllGlobals();
});

describe("API client", () => {
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

  it("adds the signed-in user's token to write requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    setAccessToken("session-token");

    await api.addRequirement({
      college: "OC",
      subject: "ACCT",
      course_number: "100",
      text: "Bring a calculator.",
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer session-token",
    );
  });
});
