// Pure error vocabulary for admin callables (no Firebase import, so it is
// unit-testable under node --test). See lib/api.ts for the caller.

export type ApiErrorKind =
  | "permission"
  | "auth"
  | "validation"
  | "not-found"
  | "conflict"
  | "unavailable"
  | "missing-function"
  | "unknown";

export class AdminApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly code: string;
  readonly retryable: boolean;

  constructor(kind: ApiErrorKind, code: string, message: string) {
    super(message);
    this.name = "AdminApiError";
    this.kind = kind;
    this.code = code;
    this.retryable = kind === "unavailable" || kind === "unknown";
  }
}

/// FirebaseError-ish → AdminApiError with an operator-readable message.
export function normaliseError(e: unknown): AdminApiError {
  if (e instanceof AdminApiError) return e;
  const code = String((e as { code?: unknown })?.code ?? "unknown").replace(/^functions\//, "");
  const raw = String((e as { message?: unknown })?.message ?? "");
  switch (code) {
    case "permission-denied":
      return new AdminApiError("permission", code, raw || "Your role does not allow this.");
    case "unauthenticated":
      return new AdminApiError("auth", code, "Your session has expired. Sign in again.");
    case "invalid-argument":
    case "out-of-range":
      return new AdminApiError("validation", code, raw || "Some input was not accepted.");
    case "not-found":
      // A callable that is not deployed answers 404 with the bare status
      // text; a handler's own not-found carries a sentence.
      if (raw === "NOT_FOUND" || raw === "not-found" || raw === "") {
        return new AdminApiError(
          "missing-function",
          code,
          "This console feature needs a backend update that is not deployed yet.",
        );
      }
      return new AdminApiError("not-found", code, raw);
    case "already-exists":
    case "failed-precondition":
    case "aborted":
      return new AdminApiError("conflict", code, raw || "The request conflicts with the current state.");
    case "unavailable":
    case "deadline-exceeded":
    case "resource-exhausted":
    case "internal":
      return new AdminApiError(
        "unavailable",
        code,
        "The service did not respond. The action may still have completed. Refresh and check the result before retrying.",
      );
    default:
      if (/network|failed to fetch|offline/i.test(raw)) {
        return new AdminApiError(
          "unavailable",
          "network",
          "You appear to be offline. Check your connection and retry.",
        );
      }
      return new AdminApiError("unknown", code, "Something went wrong. Try again, and report it if it persists.");
  }
}

/// Message for an error thrown out of a confirm handler. A plain Error is text the
/// caller wrote on purpose (conflict, duplicate, rate limit, ...): show it as is.
/// Everything else (API/SDK errors, runtime bugs) goes through the operator-safe vocabulary.
export function operatorMessage(e: unknown): string {
  if (e !== null && typeof e === "object" && e.constructor === Error) return (e as Error).message;
  return normaliseError(e).message;
}
