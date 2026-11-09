/** An error whose message is already written for the person using the app. */
export class StoreError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "StoreError";
    this.cause = cause;
  }
}

interface ErrorLike {
  code?: string;
  status?: number;
  message?: string;
  cause?: unknown;
}

const asErrorLike = (error: unknown): ErrorLike => (typeof error === "object" && error !== null ? error as ErrorLike : {});

const isNetworkError = (error: unknown) => error instanceof TypeError || /fetch|network/i.test(asErrorLike(error).message || "");

/** Plain-language message for a failed save, load or import. */
export function describeStoreError(error: unknown, fallback: string): string {
  const cause = asErrorLike(asErrorLike(error).cause ?? error);
  if (cause.code === "23505") return "A collection with that name already exists.";
  if (isNetworkError(cause)) return "Your account couldn't be reached. Check your internet connection and try again.";
  if (cause.status === 401 || cause.code === "PGRST301") return "Your sign-in has expired. Sign in again to keep saving.";
  if (error instanceof StoreError && !asErrorLike(error).cause) return error.message;
  return fallback;
}

export const MIN_PASSWORD_LENGTH = 8;

/** Plain-language message for a failed sign-in, sign-up or password change. */
export function describeAuthError(error: unknown, fallback: string): string {
  const { code = "", message = "", status } = asErrorLike(error);
  if (status === 429 || /rate limit/i.test(message) || code === "over_email_send_rate_limit") {
    return "Too many emails were sent recently. Wait a few minutes, then try again.";
  }
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "That email and password don't match. Try again, or choose “Forgot password?”.";
  }
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
    return "Confirm your email first: open the link we sent when you created your account.";
  }
  if (code === "weak_password" || /password should/i.test(message)) {
    return `Choose a stronger password: at least ${MIN_PASSWORD_LENGTH} characters, mixing letters and numbers.`;
  }
  if (code === "same_password") return "That's already your password. Choose a different one.";
  if (code === "reauthentication_needed" || /reauthenticat/i.test(message)) {
    return "For security, sign out and sign in again before changing your password.";
  }
  if (isNetworkError(error)) return "Your account couldn't be reached. Check your internet connection and try again.";
  return fallback;
}
