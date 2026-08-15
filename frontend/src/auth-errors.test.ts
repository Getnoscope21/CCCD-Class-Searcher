import { describe, expect, it } from "vitest";
import { authErrorMetadata, safeAuthErrorMessage } from "./auth-errors";

describe("safe authentication errors", () => {
  it("explains actionable setup and rate-limit failures", () => {
    expect(
      safeAuthErrorMessage(
        { code: "email_address_not_authorized", status: 422 },
        "signup",
      ),
    ).toContain("custom SMTP");
    expect(
      safeAuthErrorMessage(
        { code: "over_email_send_rate_limit", status: 429 },
        "signup",
      ),
    ).toContain("Wait");
    expect(
      safeAuthErrorMessage({ code: "weak_password", status: 422 }, "signup"),
    ).toContain("password");
  });

  it("does not reveal whether an account exists", () => {
    const duplicate = safeAuthErrorMessage(
      { code: "user_already_exists", status: 422 },
      "signup",
    );
    expect(duplicate).not.toMatch(/exists|registered|account found/i);

    const invalidCredentials = safeAuthErrorMessage(
      { code: "invalid_credentials", status: 400 },
      "signin",
    );
    const unconfirmed = safeAuthErrorMessage(
      { code: "email_not_confirmed", status: 400 },
      "signin",
    );
    expect(invalidCredentials).toBe(unconfirmed);
  });

  it("logs only stable non-sensitive metadata", () => {
    expect(
      authErrorMetadata({
        code: "weak_password",
        status: 422,
        message: "contains provider internals",
      }),
    ).toEqual({ code: "weak_password", status: 422 });
  });
});
