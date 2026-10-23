/**
 * A Studio route's refusal, as one sentence for the builder: its message, and
 * when to retry when the route said so (Retry-After). The starter kit and the
 * solution document are refused by design — the organisation's compile time
 * spent, the compiler busy or turned off, a document past its budget — and a
 * screen that dropped the refusal showed an empty panel or downloaded the
 * error's JSON as the document (consolidated review round 1).
 *
 * Pure, for client components.
 */

/** "Try again in N s", "… in N min", or "… at HH:MM UTC" for a wait past an hour; null when there is none. */
export function retryAfterSentence(retryAfter: string | null, now: Date = new Date()): string | null {
  if (retryAfter === null || !/^\d+$/.test(retryAfter.trim())) return null;
  const seconds = Number(retryAfter.trim());
  if (seconds < 60) return `Try again in ${Math.max(1, seconds)} s.`;
  if (seconds < 3600) return `Try again in ${Math.ceil(seconds / 60)} min.`;
  const at = new Date(now.getTime() + seconds * 1000);
  return `Try again at ${at.toISOString().slice(11, 16)} UTC.`;
}

/** The refusal of a response that is not ok: its `error.message` (or `fallback`), and its retry time. */
export function refusalMessage(res: { headers: { get(name: string): string | null } }, json: unknown, fallback: string): string {
  const message = (json as { error?: { message?: unknown } } | null)?.error?.message;
  const text = typeof message === "string" && message.trim() !== "" ? message : fallback;
  const retry = retryAfterSentence(res.headers.get("retry-after"));
  // The allowance's own words already name 00:00 UTC; the minutes until then add nothing.
  return retry && !/00:00 UTC/.test(text) ? `${text} ${retry}` : text;
}
