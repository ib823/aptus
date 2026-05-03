/**
 * EarlyWatch Alert (EWA) ingest — parses an SAP Service Report .DOC
 * (WordprocessingML 2003 XML) into:
 *   - BrownfieldAssessment    (auto-create if not present)
 *   - SystemBaselineSnapshot  (one row per ingested EWA file)
 *   - EwaFinding[]            (one row per alert in the Alert Overview section)
 *
 * Idempotent via SystemBaselineSnapshot.sourceFileHash unique constraint.
 *
 * Usage:
 *   $ pnpm tsx scripts/ingest/brownfield-ewa-adapter.ts \
 *       "/workspaces/aptus/Conversion/Appendix 2(a) - SAP Service Report.DOC"
 *   $ pnpm tsx scripts/ingest/brownfield-ewa-adapter.ts \
 *       <doc-path> --catalog-id <BrownfieldCatalogVersion-id>
 */

import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { prisma } from "../../src/lib/db/prisma";

// -------------------------------------------------------------
// WordprocessingML 2003 XML parsing
// -------------------------------------------------------------

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Extract paragraphs in document order. Each paragraph is the concatenation
 *  of its `<w:t>` text runs, with whitespace normalized. */
function extractParagraphs(xml: string): string[] {
  const paragraphs: string[] = [];
  const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = pRegex.exec(xml)) !== null) {
    const inner = pMatch[1] ?? "";
    let text = "";
    let tMatch: RegExpExecArray | null;
    tRegex.lastIndex = 0;
    while ((tMatch = tRegex.exec(inner)) !== null) {
      text += tMatch[1] ?? "";
    }
    text = decodeXmlEntities(text).replace(/\s+/g, " ").trim();
    if (text.length > 0) paragraphs.push(text);
  }
  return paragraphs;
}

// -------------------------------------------------------------
// Metadata extraction (header section of every EWA report)
// -------------------------------------------------------------

interface EwaMetadata {
  customerName: string | null;
  sourceSystemId: string | null;
  sourceProduct: string | null;
  sourceDatabase: string | null;
  sourceProductType: string | null;
  sourceCountry: string | null;
  sapInstallationNumber: string | null;
  sapCustomerNumber: string | null;
  sessionNo: string | null;
  periodFrom: Date | null;
  periodTo: Date | null;
}

function parseDdMmYyyy(s: string): Date | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

function extractMetadata(paragraphs: string[]): EwaMetadata {
  // EWA reports render the header as a Word table where each cell is a
  // separate <w:p>. After paragraph extraction the cells appear in document
  // order: label cells first (Product, Status, DB System, Customer, Analysis
  // from, Until, Processed by SAP), then value cells (dates, "EarlyWatch®
  // Alert", "Service Report", city, country, SID, product, type, DB, customer).
  // "Session No.", "Installation No.", "Customer No." labels precede their
  // numeric values further down.
  //
  // Strategy: anchor on the "Service Report" paragraph; the next 7 paragraphs
  // are city, country, SID, product, type, DB, customer in that exact order.
  // Anchor on "Customer No." for the trailing numeric triple.
  const meta: EwaMetadata = {
    customerName: null,
    sourceSystemId: null,
    sourceProduct: null,
    sourceDatabase: null,
    sourceProductType: null,
    sourceCountry: null,
    sapInstallationNumber: null,
    sapCustomerNumber: null,
    sessionNo: null,
    periodFrom: null,
    periodTo: null,
  };

  // Period: two dd.mm.yyyy dates near the start of the document.
  const headBlob = paragraphs.slice(0, 30).join(" ");
  const dateMatches = headBlob.match(/\b\d{2}\.\d{2}\.\d{4}\b/g) ?? [];
  if (dateMatches.length >= 2) {
    meta.periodFrom = parseDdMmYyyy(dateMatches[0]!);
    meta.periodTo = parseDdMmYyyy(dateMatches[1]!);
  }

  // Anchor on "Service Report" paragraph (case-sensitive — it's a fixed label).
  const serviceReportIdx = paragraphs.findIndex((p) => /^Service Report$/i.test(p.trim()));
  if (serviceReportIdx >= 0) {
    // Sequence: city, country, SID, product, type, db, customer
    const slots = [
      { i: serviceReportIdx + 1, name: "city" },
      { i: serviceReportIdx + 2, name: "country" },
      { i: serviceReportIdx + 3, name: "sid" },
      { i: serviceReportIdx + 4, name: "product" },
      { i: serviceReportIdx + 5, name: "type" },
      { i: serviceReportIdx + 6, name: "db" },
      { i: serviceReportIdx + 7, name: "customer" },
    ];
    const get = (i: number): string | null =>
      i < paragraphs.length ? paragraphs[i]!.trim() || null : null;
    meta.sourceCountry = get(slots[1]!.i);
    meta.sourceSystemId = get(slots[2]!.i);
    meta.sourceProduct = get(slots[3]!.i);
    meta.sourceProductType = get(slots[4]!.i);
    const dbRaw = get(slots[5]!.i);
    meta.sourceDatabase = dbRaw ? dbRaw.toUpperCase() : null;
    meta.customerName = get(slots[6]!.i);
  }

  // Session/Installation/Customer numbers — anchor on "Customer No." label.
  const customerNoIdx = paragraphs.findIndex((p) => /^Customer No\.?$/i.test(p.trim()));
  if (customerNoIdx >= 0 && customerNoIdx + 3 < paragraphs.length) {
    const sessionRaw = paragraphs[customerNoIdx + 1]?.trim() ?? "";
    const installRaw = paragraphs[customerNoIdx + 2]?.trim() ?? "";
    const customerRaw = paragraphs[customerNoIdx + 3]?.trim() ?? "";
    if (/^\d{6,15}$/.test(sessionRaw)) meta.sessionNo = sessionRaw;
    if (/^\d{6,15}$/.test(installRaw)) meta.sapInstallationNumber = installRaw;
    if (/^\d{6,15}$/.test(customerRaw)) meta.sapCustomerNumber = customerRaw;
  }

  return meta;
}

// -------------------------------------------------------------
// Alert extraction
// -------------------------------------------------------------

interface AlertRow {
  category: string;
  severity: string;
  title: string;
  sortOrder: number;
}

const CATEGORY_RULES: Array<{ category: string; rx: RegExp }> = [
  { category: "Maintenance", rx: /\b(maintenance|product version|outdated|support has (?:ended|already ended|expired)|priority-one support|extended maintenance)\b/i },
  { category: "Security", rx: /\b(secure|security|password|gateway access|message server|critical authoriz|standard users?|SAP\*|TMSADM|RFC Gateway)\b/i },
  { category: "Performance", rx: /\b(performance|response time|throughput|workload|long running|high cpu)\b/i },
  { category: "Database", rx: /\b(database|DB version|tablespace|HANA|ORACLE|fragmentation|backup)\b/i },
  { category: "Hardware", rx: /\b(CPU|memory|hardware capacity|sizing|disk space)\b/i },
  { category: "ABAP_Dump", rx: /\b(ABAP dump|dumps in your system|short dump)\b/i },
  { category: "Service_Notes", rx: /\b(SAP Notes? .*not implemented|side effects in SAP|Security Notes?)\b/i },
  { category: "Configuration", rx: /\b(configuration|parameter|profile)\b/i },
];

function categorize(title: string): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.rx.test(title)) return rule.category;
  }
  return "Other";
}

function severityForCategory(category: string, title: string): string {
  // EWA reports the SAP traffic-light per alert in the rendered table; the
  // doc text doesn't carry the cell color directly, so we infer from
  // category + signal words. Conservative: maintenance/security default Red,
  // performance Yellow, configuration Yellow, others Yellow.
  if (/\b(ended|outdated|critical|not (?:effective|protected|sufficient))\b/i.test(title)) return "Red";
  if (category === "Maintenance" || category === "Security") return "Red";
  if (category === "Performance" || category === "Configuration") return "Yellow";
  return "Yellow";
}

/**
 * Identify the Alert Overview section: it begins after the paragraph
 * "Alert Overview" and ends at the paragraph "To provide feedback…".
 * Each paragraph in between is one alert (a single sentence describing
 * the issue).
 */
function extractAlerts(paragraphs: string[]): AlertRow[] {
  let startIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    if (startIdx === -1 && /^Alert Overview\b/i.test(p)) {
      startIdx = i;
      continue;
    }
    if (startIdx !== -1 && /^To provide feedback/i.test(p)) {
      endIdx = i;
      break;
    }
  }
  if (startIdx === -1) {
    // Fall back: many EWAs use "Alert Overview" as a leading word in the
    // first alert paragraph itself rather than as a standalone heading.
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i]!;
      const m = /^Alert Overview\s+(.+)$/i.exec(p);
      if (m) {
        // Convert: synthesize a synthetic heading then the rest as the first alert.
        paragraphs.splice(i, 1, "Alert Overview", m[1]!);
        startIdx = i;
        break;
      }
    }
  }
  if (startIdx === -1) return [];
  if (endIdx === -1) {
    // Fallback end: stop at "Service Summary" or "Note:" or after 60 paragraphs
    endIdx = Math.min(startIdx + 60, paragraphs.length);
    for (let i = startIdx + 1; i < endIdx; i++) {
      if (/^(Service Summary|Note:)/i.test(paragraphs[i]!)) {
        endIdx = i;
        break;
      }
    }
  }
  const out: AlertRow[] = [];
  let order = 0;
  for (let i = startIdx + 1; i < endIdx; i++) {
    const title = paragraphs[i]!.trim();
    if (title.length < 12) continue; // skip noise
    if (/^(Alert|Page|Confidential|©)/i.test(title)) continue;
    const category = categorize(title);
    out.push({
      category,
      severity: severityForCategory(category, title),
      title,
      sortOrder: order++,
    });
  }
  return out;
}

// -------------------------------------------------------------
// Orchestrator
// -------------------------------------------------------------

export async function runEwaIngest(
  docPath: string,
  options: { catalogId?: string; assessmentId?: string; assessmentName?: string } = {},
): Promise<void> {
  console.log(`[brownfield-ewa] Reading ${docPath}`);
  const buf = await readFile(docPath);
  const sourceFileHash = createHash("sha256").update(buf).digest("hex");
  const xml = buf.toString("utf8");

  const paragraphs = extractParagraphs(xml);
  console.log(`[brownfield-ewa] Extracted ${paragraphs.length} non-empty paragraphs`);

  const meta = extractMetadata(paragraphs);
  console.log(
    `[brownfield-ewa] Metadata: customer="${meta.customerName}" system=${meta.sourceSystemId} product="${meta.sourceProduct}" db=${meta.sourceDatabase} type=${meta.sourceProductType} country=${meta.sourceCountry}`,
  );
  console.log(
    `[brownfield-ewa]           period ${meta.periodFrom?.toISOString().slice(0, 10) ?? "?"}–${meta.periodTo?.toISOString().slice(0, 10) ?? "?"} session=${meta.sessionNo} install=${meta.sapInstallationNumber} customer=${meta.sapCustomerNumber}`,
  );

  const alerts = extractAlerts(paragraphs);
  console.log(`[brownfield-ewa] Extracted ${alerts.length} alerts`);

  // Resolve catalog version (target catalog the assessment is scored against)
  let resolvedCatalogId = options.catalogId ?? null;
  if (!resolvedCatalogId) {
    const latest = await prisma.brownfieldCatalogVersion.findFirst({
      where: { isActive: true },
      orderBy: { ingestedAt: "desc" },
    });
    if (!latest) {
      throw new Error(
        "No active BrownfieldCatalogVersion exists. Run brownfield-sic-adapter.ts first or pass --catalog-id.",
      );
    }
    resolvedCatalogId = latest.id;
  }

  // Resolve / create the BrownfieldAssessment
  let assessmentId = options.assessmentId ?? null;
  if (!assessmentId) {
    const existing = meta.customerName && meta.sourceSystemId
      ? await prisma.brownfieldAssessment.findFirst({
          where: {
            customerName: meta.customerName,
            sourceSystemId: meta.sourceSystemId,
          },
        })
      : null;
    if (existing) {
      assessmentId = existing.id;
      console.log(`[brownfield-ewa] Reusing BrownfieldAssessment ${assessmentId} (${existing.name})`);
    } else {
      const name =
        options.assessmentName ??
        `${meta.customerName ?? "Unknown customer"} — ${meta.sourceSystemId ?? "?"} → S/4HANA`;
      const created = await prisma.brownfieldAssessment.create({
        data: {
          name,
          customerName: meta.customerName ?? "Unknown",
          catalogVersionId: resolvedCatalogId,
          sourceSystemId: meta.sourceSystemId,
          sourceProduct: meta.sourceProduct,
          sourceDatabase: meta.sourceDatabase,
          sourceProductType: meta.sourceProductType,
          sourceCountry: meta.sourceCountry,
          sapInstallationNumber: meta.sapInstallationNumber,
          sapCustomerNumber: meta.sapCustomerNumber,
          status: "draft",
        },
      });
      assessmentId = created.id;
      console.log(`[brownfield-ewa] Created BrownfieldAssessment ${assessmentId} (${name})`);
    }
  }

  // Idempotency: skip if a snapshot with this hash already exists for the assessment
  const existingSnap = await prisma.systemBaselineSnapshot.findUnique({
    where: {
      sourceFileHash_brownfieldAssessmentId: {
        sourceFileHash,
        brownfieldAssessmentId: assessmentId!,
      },
    },
  });
  if (existingSnap) {
    console.log(
      `[brownfield-ewa] Snapshot already exists (id=${existingSnap.id}). No-op.`,
    );
    return;
  }

  const snapshot = await prisma.systemBaselineSnapshot.create({
    data: {
      brownfieldAssessmentId: assessmentId!,
      sourceType: "EWA",
      sourceFilePath: docPath,
      sourceFileHash,
      capturedAt: meta.periodFrom,
      facts: {
        customerName: meta.customerName,
        sourceSystemId: meta.sourceSystemId,
        sourceProduct: meta.sourceProduct,
        sourceDatabase: meta.sourceDatabase,
        sourceProductType: meta.sourceProductType,
        sourceCountry: meta.sourceCountry,
        sapInstallationNumber: meta.sapInstallationNumber,
        sapCustomerNumber: meta.sapCustomerNumber,
        sessionNo: meta.sessionNo,
        periodFrom: meta.periodFrom?.toISOString() ?? null,
        periodTo: meta.periodTo?.toISOString() ?? null,
      },
      rawText: paragraphs.join("\n").slice(0, 200000), // cap at 200KB to avoid bloat
    },
  });
  console.log(`[brownfield-ewa] Created SystemBaselineSnapshot ${snapshot.id}`);

  if (alerts.length > 0) {
    await prisma.ewaFinding.createMany({
      data: alerts.map((a) => ({
        snapshotId: snapshot.id,
        category: a.category,
        severity: a.severity,
        title: a.title,
        sortOrder: a.sortOrder,
      })),
    });
    console.log(`[brownfield-ewa] Inserted ${alerts.length} EwaFinding rows`);
  }

  console.log(
    `[brownfield-ewa] Done. Assessment ${assessmentId} now has snapshot ${snapshot.id} with ${alerts.length} findings.`,
  );
}

if (process.argv[1] && process.argv[1].endsWith("brownfield-ewa-adapter.ts")) {
  const args = process.argv.slice(2);
  const docPath = args[0];
  if (!docPath) {
    console.error(
      "Usage: tsx scripts/ingest/brownfield-ewa-adapter.ts <doc-path> [--catalog-id <id>] [--assessment-id <id>] [--assessment-name '...']",
    );
    process.exit(1);
  }
  const catalogIdx = args.indexOf("--catalog-id");
  const assessmentIdx = args.indexOf("--assessment-id");
  const nameIdx = args.indexOf("--assessment-name");
  const opts: { catalogId?: string; assessmentId?: string; assessmentName?: string } = {};
  const ci = catalogIdx >= 0 ? args[catalogIdx + 1] : undefined;
  const ai = assessmentIdx >= 0 ? args[assessmentIdx + 1] : undefined;
  const an = nameIdx >= 0 ? args[nameIdx + 1] : undefined;
  if (ci) opts.catalogId = ci;
  if (ai) opts.assessmentId = ai;
  if (an) opts.assessmentName = an;
  runEwaIngest(docPath, opts)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error("[brownfield-ewa] Failed:", err);
      void prisma.$disconnect();
      process.exit(1);
    });
}
