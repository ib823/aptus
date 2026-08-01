/**
 * One way to write a date.
 *
 * THE PROBLEM THIS SOLVES. The product formatted dates at least six different
 * ways: `en-US` on the SAP catalogue (`7/29/2026`), `en-GB` on the Governance
 * Audit (`31/07/2026`), `en-MY` in places, `en` in others, and the host default
 * wherever the locale was omitted entirely. Two of those are actively dangerous
 * together: `7/29/2026` and `31/07/2026` put the day and month in opposite
 * positions, and a firm operating across Malaysia, Japan and Europe has readers
 * who will parse each one the wrong way round.
 *
 * `03/04/2026` is a real date in both conventions and a different day in each.
 * On a governance record, that is not a nitpick.
 *
 * THE FORMAT. Day, short month name, year — `29 Jul 2026`. A named month cannot
 * be transposed with the day, which is the entire point; it survives being read
 * by someone who does not know which convention the product chose, and it needs
 * no legend. `en-GB` is passed as the locale to fix the ORDER, not to claim a
 * British audience; the month name makes the order unambiguous anyway.
 *
 * ISO (`2026-07-29`) is the other defensible answer and is used by
 * `formatDateIso` for machine-facing and sortable contexts. It loses to the
 * named month for anything an executive reads in a meeting.
 *
 * UTC, ALWAYS. Server-rendered pages format on the server and hydrate on the
 * client; if these read the ambient zone, the two disagree and React reports a
 * hydration mismatch on any date near midnight. Pinning UTC also means two
 * people in different offices discussing "the 29th" mean the same day.
 */

type DateInput = Date | string | number;

function toDate(value: DateInput): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * What to render when a date is absent or unparseable.
 *
 * An em dash, never today's date and never an empty string: a blank cell reads
 * as "nothing happened", and a silently substituted `new Date()` would be a
 * fabricated fact on a record that is meant to be evidence.
 */
export const NO_DATE = "—";

/** `29 Jul 2026`. The default for anything a person reads. */
export function formatDate(value: DateInput | null | undefined): string {
  if (value == null) return NO_DATE;
  const d = toDate(value);
  if (!d) return NO_DATE;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** `29 Jul 2026, 14:05` — 24-hour, so there is no am/pm to misread. */
export function formatDateTime(value: DateInput | null | undefined): string {
  if (value == null) return NO_DATE;
  const d = toDate(value);
  if (!d) return NO_DATE;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(d);
}

/** `2026-07-29`. Sortable; for machine-facing output, filenames and exports. */
export function formatDateIso(value: DateInput | null | undefined): string {
  if (value == null) return NO_DATE;
  const d = toDate(value);
  if (!d) return NO_DATE;
  return d.toISOString().slice(0, 10);
}

/**
 * `in 6 days` / `12 days ago` / `today`.
 *
 * For expiry runways, where the arithmetic is the point and an absolute date
 * makes the reader do it themselves. Callers pass `now` so this stays testable
 * and so a server-rendered page does not disagree with its own hydration.
 */
export function formatRelativeDays(
  value: DateInput | null | undefined,
  now: Date = new Date(),
): string {
  if (value == null) return NO_DATE;
  const d = toDate(value);
  if (!d) return NO_DATE;
  const days = Math.round((d.getTime() - now.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}
