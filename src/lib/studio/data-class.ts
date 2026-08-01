/**
 * Data classification — a controlled vocabulary, not free text.
 *
 * `dataClass` was `z.string().min(1).max(80)`, and the register contains the
 * value `czxgvz`. The portfolio screen is honest about the consequence — "it is
 * a free-text declaration; nothing in the platform reads it, and no gate
 * depends on it" — but that honesty describes a field that cannot do its job.
 *
 * A classification only means something if the set of values is closed. Two
 * teams writing "Confidential" and "confidential (client PII)" have not
 * classified anything comparably, and no report can group them.
 *
 * WHAT THIS DOES AND DOES NOT CHANGE. It closes the vocabulary. It does NOT
 * turn the field into a control — nothing gates on it yet, and the portfolio's
 * provenance note still says so, because claiming enforcement that does not
 * exist would be the worse defect. What it buys is that the day something DOES
 * gate on classification, the existing rows are meaningful.
 */

export const DATA_CLASSES = [
  {
    value: "PUBLIC",
    label: "Public",
    description: "Already published, or safe to publish. No restriction.",
  },
  {
    value: "INTERNAL",
    label: "Internal",
    description: "ABeam-internal. Not client data and not for external sharing.",
  },
  {
    value: "CLIENT_CONFIDENTIAL",
    label: "Client confidential",
    description:
      "A client's business data — process design, configuration, commercial terms. The default for anything touching a client system.",
  },
  {
    value: "PERSONAL_DATA",
    label: "Personal data",
    description:
      "Identifies a living person. Carries PDPA / GDPR obligations regardless of who owns the system it came from.",
  },
  {
    value: "SENSITIVE_PERSONAL_DATA",
    label: "Sensitive personal data",
    description:
      "Special-category personal data — health, biometrics, payroll at individual level. The highest bar the platform recognises.",
  },
] as const;

export type DataClass = (typeof DATA_CLASSES)[number]["value"];

export const DATA_CLASS_VALUES = DATA_CLASSES.map((c) => c.value) as readonly DataClass[];

export function isDataClass(value: string): value is DataClass {
  return (DATA_CLASS_VALUES as readonly string[]).includes(value);
}

export function dataClassLabel(value: string): string {
  return DATA_CLASSES.find((c) => c.value === value)?.label ?? value;
}

/**
 * Where a legacy free-text value lands.
 *
 * Existing rows hold arbitrary strings, including keyboard mash. They are NOT
 * silently mapped onto a real class — inventing "INTERNAL" for `czxgvz` would
 * manufacture a classification nobody made. They read as unclassified, which is
 * true, and which is the thing someone should act on.
 */
export const UNCLASSIFIED = "UNCLASSIFIED" as const;

export function normaliseLegacyDataClass(value: string | null | undefined): string {
  if (!value) return UNCLASSIFIED;
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return isDataClass(upper) ? upper : UNCLASSIFIED;
}
