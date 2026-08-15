export type AuthOperation = "signin" | "signup";

type AuthErrorLike = {
  code?: unknown;
  status?: unknown;
};

export function authErrorMetadata(error: unknown): {
  code: string;
  status: number | null;
} {
  const value =
    typeof error === "object" && error !== null
      ? (error as AuthErrorLike)
      : undefined;
  return {
    code: typeof value?.code === "string" ? value.code : "unknown",
    status: typeof value?.status === "number" ? value.status : null,
  };
}

export function safeAuthErrorMessage(
  error: unknown,
  operation: AuthOperation,
): string {
  const { code, status } = authErrorMetadata(error);

  if (code === "over_email_send_rate_limit") {
    return "Too many confirmation emails were requested. Wait before trying again.";
  }
  if (status === 429 || code === "over_request_rate_limit") {
    return "Too many authentication attempts. Wait a few minutes and try again.";
  }
  if (code === "email_address_not_authorized") {
    return "This deployment cannot send a confirmation email to that address yet. The administrator must configure custom SMTP, or you can test with an email belonging to the Supabase project team.";
  }
  if (code === "weak_password") {
    return "That password does not meet the security requirements. Choose a longer, less common password.";
  }
  if (code === "email_address_invalid") {
    return "Enter a valid email address.";
  }
  if (code === "signup_disabled") {
    return "New account registration is currently disabled.";
  }
  if (code === "captcha_failed") {
    return "The security check failed. Refresh the page and try again.";
  }
  if (operation === "signin") {
    // Deliberately combine credential and account-state failures so the UI
    // cannot be used to discover whether an email address has an account.
    return "Unable to sign in. Check your credentials and email confirmation, then try again.";
  }
  // Deliberately keep duplicate-account and unexpected signup failures generic.
  return "Unable to create an account right now. Check your details or try again later.";
}
