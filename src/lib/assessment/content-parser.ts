/** Phase 12: SAP HTML content parser — pure function */

export interface ParsedStepContent {
  purpose: string | null;
  prerequisites: string | null;
  systemAccess: string | null;
  roles: string | null;
  masterData: string | null;
  expectedResult: string | null;
  procedure: string | null;
  mainInstructions: string;
  rawHtml: string;
  hasMeaningfulContent: boolean;
}

/** Section header labels used in lookahead patterns */
const SECTION_LABELS = [
  "Purpose",
  "Prerequisite[s]?",
  "System\\s*Access",
  "Log\\s*On",
  "Role[s]?",
  "Master\\s*Data",
  "Expected\\s*Result",
  "Procedure(?:\\s*Steps)?",
];

/** Build a lookahead that matches any other section header or end-of-string */
function sectionBoundary(exclude?: string): string {
  const labels = exclude
    ? SECTION_LABELS.filter((l) => l !== exclude)
    : SECTION_LABELS;
  return `(?=<p[^>]*>\\s*(?:${labels.join("|")})\\s*<\\/p>|$)`;
}

/** Build a regex to capture a named section */
function sectionRegex(headerPattern: string): RegExp {
  return new RegExp(
    `<p[^>]*>\\s*${headerPattern}\\s*<\\/p>([\\s\\S]*?)${sectionBoundary(headerPattern)}`,
    "i",
  );
}

/**
 * Strip SAP test administration boilerplate from HTML before parsing.
 */
function stripTestBoilerplate(html: string): string {
  const boilerplatePatterns = [
    /Test\s*Administration\s*/gi,
    /Customer\s*project:.*?(?:\n|<br|<\/)/gi,
    /Test\s*Case\s*ID\s*[:.]?\s*[^<\n]*/gi,
    /Tester\s*Name\s*[:.]?\s*[^<\n]*/gi,
    /Testing\s*Date\s*[:.]?\s*[^<\n]*/gi,
    /Duration\s*[:.]?\s*[^<\n]*/gi,
    /Business\s*Role\(s\)\s*[:.]?\s*[^<\n]*/gi,
    /Responsibility\s*[:.]?\s*[^<\n]*/gi,
    /Pass\s*\/\s*Fail\s*\/\s*Comment/gi,
  ];
  let result = html;
  for (const pattern of boilerplatePatterns) {
    result = result.replace(pattern, "");
  }
  return result;
}

/** Strip HTML tags and return plain text */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
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
      expectedResult: null,
      procedure: null,
      mainInstructions: "",
      rawHtml: html ?? "",
      hasMeaningfulContent: false,
    };
  }

  // Strip boilerplate before parsing
  const cleaned = stripTestBoilerplate(html);

  const result: ParsedStepContent = {
    purpose: null,
    prerequisites: null,
    systemAccess: null,
    roles: null,
    masterData: null,
    expectedResult: null,
    procedure: null,
    mainInstructions: cleaned,
    rawHtml: html,
    hasMeaningfulContent: false,
  };

  let remaining = cleaned;
  let foundSection = false;

  // Extract each section using consistent pattern
  const sections: Array<{ key: keyof ParsedStepContent; pattern: string }> = [
    { key: "purpose", pattern: "Purpose" },
    { key: "prerequisites", pattern: "Prerequisite[s]?" },
    { key: "systemAccess", pattern: "(?:System\\s*Access|Log\\s*On)" },
    { key: "roles", pattern: "Role[s]?" },
    { key: "masterData", pattern: "Master\\s*Data" },
    { key: "expectedResult", pattern: "Expected\\s*Result" },
    { key: "procedure", pattern: "Procedure(?:\\s*Steps)?" },
  ];

  for (const section of sections) {
    const regex = sectionRegex(section.pattern);
    const match = remaining.match(regex);
    if (match?.[1]) {
      (result[section.key] as string | null) = match[1].trim();
      remaining = remaining.replace(match[0], "");
      foundSection = true;
    }
  }

  if (foundSection) {
    result.mainInstructions = remaining.trim();
  }

  // Determine if content is meaningful: at least one section has >50 chars of text
  const allSectionTexts = [
    result.purpose,
    result.prerequisites,
    result.systemAccess,
    result.roles,
    result.masterData,
    result.expectedResult,
    result.procedure,
    result.mainInstructions,
  ];
  result.hasMeaningfulContent = allSectionTexts.some(
    (s) => s !== null && stripHtml(s).length > 50,
  );

  return result;
}
