/**
 * Count-aware nouns and verbs.
 *
 * The product reads "1 excluded rows", "1 questions are flagged" and "1 flagged
 * question need your call" — the count is interpolated and the surrounding
 * words are frozen plural. On a screen that otherwise defines every term it
 * uses, broken agreement makes the whole thing read as generated rather than
 * written, which is exactly the impression the writing works hardest to avoid.
 *
 * These are deliberately tiny and English-only. A full i18n layer is a
 * different decision; this is here so a count and its noun cannot disagree.
 */

/**
 * `pluralise(1, "row")` → `"row"`, `pluralise(2, "row")` → `"rows"`.
 *
 * Pass `plural` for anything that is not a simple `+s` ("entry" → "entries").
 */
export function pluralise(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

/** `countOf(3, "row")` → `"3 rows"`. The count and its noun, always agreeing. */
export function countOf(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralise(count, singular, plural)}`;
}

/**
 * Verb agreement: `verb(1, "is")` → `"is"`, `verb(2, "is")` → `"are"`.
 *
 * Only the irregulars the product actually uses are mapped; anything else
 * falls back to the `+s` rule that regular English verbs follow in the third
 * person singular ("need" → "needs").
 */
const IRREGULAR: Record<string, string> = {
  is: "are",
  was: "were",
  has: "have",
};

export function verb(count: number, singularForm: string): string {
  if (count === 1) return singularForm;
  const irregular = IRREGULAR[singularForm];
  if (irregular) return irregular;
  // "needs" -> "need": the plural is the bare stem.
  return singularForm.endsWith("s") ? singularForm.slice(0, -1) : singularForm;
}
