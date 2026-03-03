/**
 * Centralized error humanization utilities.
 *
 * Never expose raw Error.message or DOMException details to users.
 * These helpers map technical errors to user-friendly messages.
 */

/* ------------------------------------------------------------------ */
/*  WebAuthn error mapping                                             */
/* ------------------------------------------------------------------ */

const WEBAUTHN_ERROR_MAP: Array<{ match: RegExp | string; message: string; silent?: boolean }> = [
  // User explicitly cancelled the passkey dialog
  { match: "cancelled", message: "", silent: true },
  { match: "canceled", message: "", silent: true },
  { match: "AbortError", message: "", silent: true },
  // User declined or timed out — the most common one reported
  { match: "not allowed", message: "Passkey sign-in was cancelled. Please try again." },
  { match: "timed out", message: "The request timed out. Please try again." },
  // No credentials available on this device
  { match: "no credentials", message: "No passkey found on this device. Try another sign-in method." },
  { match: "not registered", message: "No passkey found for this account." },
  // Security key not recognized
  { match: "not supported", message: "This device does not support passkeys." },
  { match: "SecurityError", message: "A security error occurred. Please try again." },
  // Invalid state (e.g., credential already registered)
  { match: "InvalidStateError", message: "This passkey is already registered." },
  // Network / encoding
  { match: "NetworkError", message: "Network error. Please check your connection." },
  { match: "EncodingError", message: "Something went wrong. Please try again." },
];

/**
 * Converts a WebAuthn browser error into a user-friendly message.
 * Returns `null` if the error should be silently ignored (e.g., user cancel).
 */
export function humanizeWebAuthnError(err: unknown): string | null {
  const raw = err instanceof Error ? err.message : String(err);

  for (const entry of WEBAUTHN_ERROR_MAP) {
    const matches =
      typeof entry.match === "string"
        ? raw.toLowerCase().includes(entry.match.toLowerCase())
        : entry.match.test(raw);

    if (matches) {
      return entry.silent ? null : entry.message;
    }
  }

  // Fallback — never show raw error
  return "Passkey authentication failed. Please try again.";
}

/* ------------------------------------------------------------------ */
/*  General runtime error humanization                                 */
/* ------------------------------------------------------------------ */

/**
 * Converts any caught error into a generic user-friendly message.
 * Use this in catch blocks instead of `err.message`.
 *
 * @param fallback - The user-friendly fallback message to display.
 *                   Defaults to a generic "Something went wrong."
 */
export function humanizeError(_err: unknown, fallback?: string): string {
  return fallback ?? "Something went wrong. Please try again.";
}

/* ------------------------------------------------------------------ */
/*  API response error sanitization                                    */
/* ------------------------------------------------------------------ */

/**
 * Extracts the error message from a structured API response,
 * falling back to a user-friendly default. Strips any URLs or
 * stack traces that may have leaked through.
 */
export function sanitizeApiError(
  responseBody: unknown,
  fallback: string,
): string {
  const body = responseBody as { error?: { message?: string } } | null;
  const msg = body?.error?.message;

  if (!msg || typeof msg !== "string") return fallback;

  // Strip URLs that look like spec references or internal endpoints
  if (/https?:\/\/.*w3\.org/i.test(msg)) return fallback;
  if (/https?:\/\/.*localhost/i.test(msg)) return fallback;

  // Strip anything that looks like a stack trace
  if (/\bat\b.*\.(ts|js|tsx|jsx):\d+/i.test(msg)) return fallback;

  // If the message is excessively long, it's probably not user-friendly
  if (msg.length > 200) return fallback;

  return msg;
}
