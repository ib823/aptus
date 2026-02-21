/** Phase 12: SAP HTML content parser — pure function */

export interface ParsedStepContent {
  purpose: string | null;
  prerequisites: string | null;
  systemAccess: string | null;
  roles: string | null;
  masterData: string | null;
  mainInstructions: string;
  rawHtml: string;
}

/**
 * Parse SAP best practice HTML content into structured sections.
 * Falls back to putting everything in mainInstructions if no sections detected.
 */
export function parseStepContent(
  html: string,
): ParsedStepContent {
  if (!html || html.trim().length === 0) {
    return {
      purpose: null,
      prerequisites: null,
      systemAccess: null,
      roles: null,
      masterData: null,
      mainInstructions: "",
      rawHtml: html ?? "",
    };
  }

  const result: ParsedStepContent = {
    purpose: null,
    prerequisites: null,
    systemAccess: null,
    roles: null,
    masterData: null,
    mainInstructions: html,
    rawHtml: html,
  };

  let remaining = html;
  let foundSection = false;

  // Extract Purpose section
  const purposeMatch = remaining.match(/<p[^>]*>\s*Purpose\s*<\/p>([\s\S]*?)(?=<p[^>]*>\s*(?:Prerequisite[s]?|System\s*Access|Role[s]?|Master\s*Data)\s*<\/p>|$)/i);
  if (purposeMatch?.[1]) {
    result.purpose = purposeMatch[1].trim();
    remaining = remaining.replace(purposeMatch[0], "");
    foundSection = true;
  }

  // Extract Prerequisites section
  const prereqMatch = remaining.match(/<p[^>]*>\s*Prerequisite[s]?\s*<\/p>([\s\S]*?)(?=<p[^>]*>\s*(?:System\s*Access|Role[s]?|Master\s*Data|Purpose)\s*<\/p>|$)/i);
  if (prereqMatch?.[1]) {
    result.prerequisites = prereqMatch[1].trim();
    remaining = remaining.replace(prereqMatch[0], "");
    foundSection = true;
  }

  // Extract System Access section
  const sysAccessMatch = remaining.match(/<p[^>]*>\s*(?:System\s*Access|Log\s*On)\s*<\/p>([\s\S]*?)(?=<p[^>]*>\s*(?:Role[s]?|Master\s*Data|Purpose|Prerequisite[s]?)\s*<\/p>|$)/i);
  if (sysAccessMatch?.[1]) {
    result.systemAccess = sysAccessMatch[1].trim();
    remaining = remaining.replace(sysAccessMatch[0], "");
    foundSection = true;
  }

  // Extract Roles section
  const rolesMatch = remaining.match(/<p[^>]*>\s*Role[s]?\s*<\/p>([\s\S]*?)(?=<p[^>]*>\s*(?:Master\s*Data|System\s*Access|Purpose|Prerequisite[s]?)\s*<\/p>|$)/i);
  if (rolesMatch?.[1]) {
    result.roles = rolesMatch[1].trim();
    remaining = remaining.replace(rolesMatch[0], "");
    foundSection = true;
  }

  // Extract Master Data section
  const masterDataMatch = remaining.match(/<p[^>]*>\s*Master\s*Data\s*<\/p>([\s\S]*?)(?=<p[^>]*>\s*(?:Role[s]?|System\s*Access|Purpose|Prerequisite[s]?)\s*<\/p>|$)/i);
  if (masterDataMatch?.[1]) {
    result.masterData = masterDataMatch[1].trim();
    remaining = remaining.replace(masterDataMatch[0], "");
    foundSection = true;
  }

  if (foundSection) {
    result.mainInstructions = remaining.trim();
  }

  return result;
}
