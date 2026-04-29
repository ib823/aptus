/**
 * Number formatting utilities — single source of truth for how numeric
 * values are presented across web UI, PDF, XLSX and DOCX surfaces.
 *
 * **Master rule:** any integer that *could* exceed 999 in real engagements
 * (counts, effort days, currency amounts, record counts) MUST be rendered
 * with a thousands separator (US locale: comma every three digits). IDs,
 * version numbers, year values, percentages, and pagination page numbers
 * are excluded — see `formatId` and `formatPercent` for opposite-side
 * helpers that document intent.
 *
 * Use the named helpers in JSX, in PDF generators, and in any place where
 * a numeric value is interpolated into a string. ExcelJS columns receive
 * the same effect via `numFmt = NUMFMT_THOUSANDS`.
 */

/** "1234" → "1,234". null / undefined → em-dash. NaN → "0". */
export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return value == null ? "—" : "0";
  return value.toLocaleString("en-US");
}

/** Format with `decimals` fixed decimal places, retaining thousands separator.
 * `formatDecimal(1234.5, 1)` → "1,234.5". */
export function formatDecimal(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value == null || Number.isNaN(value)) return value == null ? "—" : "0";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format effort days as "1,234 days" / "1 day" / "0 days". */
export function formatEffortDays(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const n = formatNumber(value);
  return value === 1 ? `${n} day` : `${n} days`;
}

/** Format a percentage `0–100` (already in percent units). No thousands. */
export function formatPercent(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return decimals === 0
    ? `${Math.round(value)}%`
    : `${value.toFixed(decimals)}%`;
}

/** Format a fractional ratio `0–1` as a percentage. `formatRatio(0.85)` → "85%". */
export function formatRatio(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return formatPercent(value * 100, decimals);
}

/** Format USD currency with thousands separator. `formatCurrency(31412.5)` → "$31,412.50". */
export function formatCurrency(
  value: number | null | undefined,
  currency = "USD",
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** ExcelJS number-format string for thousands-separated integer columns. */
export const NUMFMT_THOUSANDS = "#,##0";

/** ExcelJS number-format string for thousands-separated decimal columns. */
export const NUMFMT_THOUSANDS_DECIMAL = "#,##0.0";

/** ExcelJS number-format string for currency columns. */
export const NUMFMT_CURRENCY = '"$"#,##0.00';

/** Identity helper for explicit "do NOT thousands-format" intent — keeps
 * grep-able discipline on IDs, version codes, page numbers, year values. */
export function formatId(value: string | number): string {
  return String(value);
}
