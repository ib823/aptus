/** Phase 10: Extract business summary from SAP purposeHtml */

const SAP_BOILERPLATE_PATTERNS = [
  /This\s+(?:document|scope\s+item)\s+(?:describes?|covers?|explains?)\s+(?:the\s+)?(?:SAP\s+)?(?:Best\s+Practice[s]?\s+)?(?:for\s+)?/gi,
  /(?:For\s+more\s+information[,\s]+)?(?:see|refer\s+to)\s+(?:the\s+)?SAP\s+(?:Help|Note|KBA)\s+\d+/gi,
  /SAP\s+S\/4HANA\s+Cloud[,\s]+(?:public|private)\s+edition/gi,
];

/**
 * Extract a clean business summary from SAP purposeHtml.
 * Strips HTML tags, SAP boilerplate phrases, and truncates to maxChars.
 */
export function extractScopeSummary(purposeHtml: string | null, maxChars = 200): string {
  if (!purposeHtml || purposeHtml.trim().length === 0) return "";

  // Strip HTML tags
  let text = purposeHtml.replace(/<[^>]*>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");

  // Strip SAP boilerplate
  for (const pattern of SAP_BOILERPLATE_PATTERNS) {
    text = text.replace(pattern, "");
  }

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  if (text.length <= maxChars) return text;

  // Truncate at word boundary
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.6 ? truncated.slice(0, lastSpace) : truncated) + "…";
}
