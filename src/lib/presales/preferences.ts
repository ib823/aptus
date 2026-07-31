/**
 * Consultant presales preferences — parse, clamp, and the stored shape.
 *
 * One module owns the field list so the THREE places that care (the settings
 * form, the POST route, and User.presalesPreferences) cannot drift apart the
 * way the form and its no-op route did for months.
 *
 * Parsing is tolerant on purpose: this receives a browser form POST, not an
 * API payload. Out-of-range numbers clamp, a malformed accent falls back to
 * the default, and unknown fields are ignored — a consultant's Save should
 * never 400 over a typo'd hex digit.
 */

export interface PresalesPreferences {
  /** Name printed on the signed PDF. Empty string = use the account name. */
  pdfDisplayName: string;
  /** Default access-window length for new grants, 1–30 days. */
  defaultWindowDays: number;
  /** Default accent color for client-facing surfaces, #rrggbb. */
  defaultAccent: string;
  notifyOnSignoff: boolean;
  notifyOnOtpLockout: boolean;
}

export const PRESALES_PREFERENCE_DEFAULTS: PresalesPreferences = {
  pdfDisplayName: "",
  defaultWindowDays: 7,
  defaultAccent: "#002B5C",
  notifyOnSignoff: true,
  notifyOnOtpLockout: true,
};

const ACCENT_RE = /^#[0-9a-fA-F]{6}$/;

/** Parse a settings-form POST body into the stored shape. */
export function parsePresalesPreferences(form: FormData): PresalesPreferences {
  const d = PRESALES_PREFERENCE_DEFAULTS;

  const name = String(form.get("pdfDisplayName") ?? "").trim().slice(0, 120);

  // Number(null) is 0 — an ABSENT field must mean "default", not "clamp to 1".
  const daysField = form.get("defaultWindowDays");
  const daysRaw =
    typeof daysField === "string" && daysField.trim() !== "" ? Number(daysField) : NaN;
  const days = Number.isFinite(daysRaw)
    ? Math.min(30, Math.max(1, Math.trunc(daysRaw)))
    : d.defaultWindowDays;

  const accentRaw = String(form.get("defaultAccent") ?? "").trim();
  const accent = ACCENT_RE.test(accentRaw) ? accentRaw.toUpperCase() : d.defaultAccent;

  // Unchecked checkboxes are ABSENT from a form POST, not "false" — so absence
  // here genuinely means "off", unlike the JSON-read path below where absence
  // means "never saved" and falls back to the default.
  return {
    pdfDisplayName: name,
    defaultWindowDays: days,
    defaultAccent: accent,
    notifyOnSignoff: form.get("notifyOnSignoff") != null,
    notifyOnOtpLockout: form.get("notifyOnOtpLockout") != null,
  };
}

/**
 * Read stored preferences back out of User.presalesPreferences.
 * NULL (never saved) and any malformed value fall back to the defaults —
 * the form must always render, whatever the column holds.
 */
export function readPresalesPreferences(stored: unknown): PresalesPreferences {
  const d = PRESALES_PREFERENCE_DEFAULTS;
  if (stored == null || typeof stored !== "object" || Array.isArray(stored)) return d;
  const o = stored as Record<string, unknown>;
  return {
    pdfDisplayName: typeof o.pdfDisplayName === "string" ? o.pdfDisplayName.slice(0, 120) : d.pdfDisplayName,
    defaultWindowDays:
      typeof o.defaultWindowDays === "number" && Number.isFinite(o.defaultWindowDays)
        ? Math.min(30, Math.max(1, Math.trunc(o.defaultWindowDays)))
        : d.defaultWindowDays,
    defaultAccent:
      typeof o.defaultAccent === "string" && ACCENT_RE.test(o.defaultAccent)
        ? o.defaultAccent.toUpperCase()
        : d.defaultAccent,
    notifyOnSignoff: typeof o.notifyOnSignoff === "boolean" ? o.notifyOnSignoff : d.notifyOnSignoff,
    notifyOnOtpLockout:
      typeof o.notifyOnOtpLockout === "boolean" ? o.notifyOnOtpLockout : d.notifyOnOtpLockout,
  };
}
