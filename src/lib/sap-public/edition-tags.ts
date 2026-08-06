/**
 * Edition classification from SAP product tags — ONE implementation.
 *
 * Moved verbatim from scripts/import-sap-api-catalog.ts (which now imports it
 * back), because the mapper stopped being a script concern the day the runtime
 * needed it: `normalizeHubRowForType` was stamping every harvested artifact
 * `appliesToPublic: true` regardless of its product tag — 500 Private-edition
 * BAdIs and Commerce Cloud integrations all labelled S/4 Public — while the
 * correct classifier sat in a script the runtime never imports. Two copies of
 * this logic would re-diverge the way the two tag dialects did; one module,
 * imported by both sides, is the only shape that stays true.
 */

// ── Edition tagging from product tags ───────────────────────────────────────
// Each "tag" may itself be a multi-product string SAP concatenates with
// ";" or "," (we observed `"S/4HANA Cloud, private edition; SAP S/4HANA Cloud"`
// in synthetic fixtures and likely in real exports). Split on those before
// classifying so a single field declaring both editions tags both.
export function splitProductTag(raw: string): string[] {
  /*
   * A COMMA MEANS TWO DIFFERENT THINGS AND BOTH APPEAR IN REAL DATA.
   *
   * The human export writes "SAP S/4HANA Cloud, private edition" — there the
   * comma introduces a QUALIFIER of the product before it. The Hub's own OData
   * writes "SAPS4HANA,SAPS4HANACloudPrivateEdition" — there it separates TWO
   * products, and refusing to split it cost every one of those rows its
   * edition: 547 APIs in the 2026-07-30 harvest carry exactly that tag.
   *
   * So split on the comma, then re-attach any part that begins with a bare
   * qualifier, which is the only case the human form produces.
   */
  const rough = raw
    .split(/\s*;\s*|\s*\|\s*|\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const parts: string[] = [];
  for (const part of rough) {
    const isBareQualifier = /^(private|public)\b/i.test(part);
    if (isBareQualifier && parts.length > 0) {
      parts[parts.length - 1] = `${parts[parts.length - 1]}, ${part}`;
    } else {
      parts.push(part);
    }
  }
  return parts.length > 0 ? parts : [raw.trim()];
}

function classifyOneTag(t: string): {
  isPublic: boolean;
  isPrivate: boolean;
  isOnPrem: boolean;
} {
  const lower = t.toLowerCase();
  /*
   * TWO SPELLINGS OF EVERY PRODUCT NAME. A downloaded export writes them for
   * people — "SAP S/4HANA Cloud, private edition". The Hub's OData writes them
   * for machines — "SAPS4HANACloudPrivateEdition", with no spaces and no
   * slash. Matching only the readable form tagged 4568 of 4597 harvested APIs
   * as "no edition", which reads exactly like "SAP publishes nothing here".
   *
   * So every needle is tested against both, with the same punctuation removed
   * from the needle as from the tag.
   */
  const compact = lower.replace(/[\s/,._-]/g, "");
  const has = (...needles: string[]) =>
    needles.some(
      (n) => lower.includes(n) || compact.includes(n.replace(/[\s/,._-]/g, "")),
    );

  const isPrivate = has(
    "private edition",
    "private cloud",
    "rise with sap",
    "s/4hana cloud, private",
  );
  const isPublic =
    has("public edition", "public cloud", "s/4hana cloud, public", "multi-tenant") ||
    // Bare "S/4HANA Cloud" with no private qualifier → Public (historical SAP convention)
    (has("s/4hana cloud") && !isPrivate);
  const isOnPrem =
    has("on premise", "on-premise", "on-prem") ||
    // Bare "SAP S/4HANA" without "Cloud" qualifier → On-Premise per SAP
    // taxonomy. Tested on the COMPACT form, so "SAPS4HANACloud" is correctly
    // excluded by its own "cloud" rather than slipping through on spacing.
    (has("s/4hana") && !compact.includes("cloud"));
  return { isPublic, isPrivate, isOnPrem };
}

export function mapEditionFromProductTags(tags: string[]): {
  appliesToPublic: boolean;
  appliesToPrivate: boolean;
  appliesToOnPrem: boolean;
} {
  let appliesToPublic = false;
  let appliesToPrivate = false;
  let appliesToOnPrem = false;
  for (const raw of tags) {
    for (const part of splitProductTag(raw)) {
      const { isPublic, isPrivate, isOnPrem } = classifyOneTag(part);
      if (isPublic) appliesToPublic = true;
      if (isPrivate) appliesToPrivate = true;
      if (isOnPrem) appliesToOnPrem = true;
    }
  }
  return { appliesToPublic, appliesToPrivate, appliesToOnPrem };
}
