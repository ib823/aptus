/**
 * SAP content sources per release — the Node-side half of
 * src/lib/sap-content/release.ts (2608 WS0, docs/2608/BUILD-LOG.md).
 *
 * Every loader that reads an SAP Best Practices file asks THIS map where the
 * file for the active release lives and which sheet carries the data, instead
 * of hard-coding a path. Selecting the release is `SAP_CONTENT_RELEASE`
 * (default 2602). Nothing here reads a file; recon-2608.ts and the WS1/WS5
 * loaders do.
 *
 * 2602 sources are the pre-WS0 locations (the SAP ZIP via SAP_ZIP_PATH and the
 * gitignored Layer0–Layer3 and BDC workbooks at the repo root) — recorded, not moved.
 */

import * as path from "node:path";

import { resolveSapContentRelease, type EnvLike, type SapContentReleaseCode } from "../../src/lib/sap-content/release";

export type SheetSource = {
  /** Repo-relative path. */
  file: string;
  /** Worksheet name that carries the data. */
  sheet: string;
  /** 1-based row holding the column headers; data starts on the next row. */
  headerRow: number;
};

export type SapContentSources = {
  release: SapContentReleaseCode;
  localisation: "MY";
  /** Directory the drop lives in (repo-relative), or null when the release has no landed drop. */
  dropDir: string | null;
  manifest: string | null;
  scopeItems: SheetSource | null; // Availability & Dependencies
  retiredScopeItems: SheetSource | null;
  sscui: SheetSource | null; // SSCUI_List <release> sheet
  processSteps: SheetSource | null; // BP_CLD_ENTPR_<release>_Process-Steps
  /** BDC questionnaires — one workbook per S4H_ id. */
  bdcQuestionnaires: { id: string; file: string }[];
  /** BPD test scripts — docx + xlsx per scope item. */
  bpd: { scopeItemCode: string; docx: string; xlsx: string }[];
  /** Where the release's content came from before WS0 (2602 only). */
  legacy?: { sapZipEnv: string; note: string };
};

const DROP_2608 = "sap-references/2608";

/** The 16 BDC questionnaires + the Two-Tier scope questionnaire shipped with 2608. */
export const BDC_2608: { id: string; file: string }[] = [
  ["S4H_1041", "S4H_1041 BDC Questionnaire - Treasury.xlsx"],
  ["S4H_1060", "S4H_1060 BDC Questionnaire - Asset Management.xlsx"],
  ["S4H_1061", "S4H_1061 BDC Questionnaire - Manufacturing.xlsx"],
  ["S4H_1613", "S4H_1613 Business Process Scope Questionnaire for Two Tier.xlsx"],
  ["S4H_1754", "S4H_1754 BDC Questionnaire - EPPM.xlsx"],
  ["S4H_1767", "S4H_1767 BDC Questionnaire - Retail.xlsx"],
  ["S4H_2132", "S4H_2132 Business Driven Configuration Questionnaire - Public Sector.xlsx"],
  ["S4H_2236", "S4H_2236 Business Driven Configuration Questionnaire - Quality Management.xlsx"],
  ["S4H_405", "S4H_405 BDC Questionnaire - Finance.xlsx"],
  ["S4H_407", "S4H_407 BDC Questionnaire - Professional Services.xlsx"],
  ["S4H_420", "S4H_420 BDC Questionnaire - Sourcing and Procurement.xlsx"],
  ["S4H_433", "S4H_433 BDC Questionnaire - Sales.xlsx"],
  ["S4H_434", "S4H_434 BDC Questionnaire - HR.xlsx"],
  ["S4H_435", "S4H_435 BDC Questionnaire - Supply Chain.xlsx"],
  ["S4H_491", "S4H_491 BDC Questionnaire - R and D Engineering.xlsx"],
  ["S4H_695", "S4H_695 BDC Questionnaire - Service.xlsx"],
  ["S4H_706", "S4H_706 BDC Questionnaire - Process Automation.xlsx"],
].map(([id, file]) => ({ id: id as string, file: path.posix.join(DROP_2608, file as string) }));

/** The 9 workbench scope items whose 2608 BPDs (docx + xlsx) are in the drop. */
export const BPD_2608_SCOPE_ITEMS = ["1IQ", "1NT", "2ET", "BD9", "BDG", "BDW", "J45", "J59", "J60"] as const;

const SOURCES_2608: SapContentSources = {
  release: "2608",
  localisation: "MY",
  dropDir: DROP_2608,
  manifest: `${DROP_2608}/MANIFEST.json`,
  scopeItems: { file: `${DROP_2608}/Availability_Dependencies_EN_XX.xlsx`, sheet: "Scope", headerRow: 2 },
  retiredScopeItems: {
    file: `${DROP_2608}/Availability_Dependencies_EN_XX.xlsx`,
    sheet: "Retired Scope Items",
    headerRow: 1,
  },
  sscui: { file: `${DROP_2608}/SSCUI_List_EN_XX.xlsm`, sheet: "2608", headerRow: 4 },
  processSteps: { file: `${DROP_2608}/BP_CLD_ENTPR_2608_Process-Steps_EN_XX.xlsx`, sheet: "Scope", headerRow: 1 },
  bdcQuestionnaires: BDC_2608,
  bpd: BPD_2608_SCOPE_ITEMS.map((code) => ({
    scopeItemCode: code,
    docx: `${DROP_2608}/bpd-fts/${code}_S4CLD2608_BPD_EN_MY.docx`,
    xlsx: `${DROP_2608}/bpd-fts/${code}_S4CLD2608_BPD_EN_MY.xlsx`,
  })),
};

const SOURCES_2602: SapContentSources = {
  release: "2602",
  localisation: "MY",
  dropDir: null,
  manifest: null,
  scopeItems: null,
  retiredScopeItems: null,
  sscui: null,
  processSteps: null,
  bdcQuestionnaires: [],
  bpd: [],
  legacy: {
    sapZipEnv: "SAP_ZIP_PATH",
    note: "2602 content was loaded from the SAP Best Practices ZIP (scripts/ingest-sap-zip.ts) and the gitignored Layer0–Layer3 / BDC workbooks at the repo root (scripts/extract-*.py). No per-file drop exists for it; ScopeCatalogVersion PUBLIC/2602 is its record.",
  },
};

const BY_RELEASE: Record<SapContentReleaseCode, SapContentSources> = {
  "2602": SOURCES_2602,
  "2608": SOURCES_2608,
};

export function sapContentSourcesFor(release: SapContentReleaseCode): SapContentSources {
  return BY_RELEASE[release];
}

/** Sources for the release selected by SAP_CONTENT_RELEASE (default 2602). */
export function activeSapContentSources(env: EnvLike = process.env): SapContentSources {
  return sapContentSourcesFor(resolveSapContentRelease(env).release);
}
