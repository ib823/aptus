/**
 * 2608 WS5 — compose one Fit-to-Standard `ScopeItemContent` payload from the
 * structured xlsx (primary) and the docx (fallback / complement).
 *
 *   process_steps      xlsx activities after "Test Procedures" (the exact steps).
 *                      role / app: the xlsx action that names them, else the docx
 *                      Overview Table row of the same name. expected: the docx
 *                      Overview Table's summary when the row exists (SAP's own
 *                      one-line outcome), else the step's last action result.
 *   business_roles     docx Roles table (names + SAP_BR_* ids); when the docx has
 *                      none, the role names the xlsx steps mention, with id "".
 *   fiori_apps         apps named by the xlsx steps, then any the docx adds.
 *   master_data        docx table.
 *   succeeding_processes  docx Appendix table.
 *   overview           xlsx opening "Additional Information" Overview paragraph,
 *                      else the docx Purpose paragraph.
 *
 * Decisions and SSCUI references are NOT composed here — the emit script
 * carries curated decisions over and grounds SSCUI refs on the 2608 list.
 */
import type { BpdDocxParse } from "./parse-bpd-docx";
import type { BpdXlsxParse } from "./parse-bpd-xlsx";

export type ComposedBpd = {
  code: string;
  title: string;
  overview: string;
  business_roles: { name: string; id: string }[];
  fiori_apps: string[];
  process_steps: { name: string; role: string; app: string; expected: string }[];
  master_data: { data: string; sample: string; details: string }[];
  succeeding_processes: { raw: string; description: string }[];
  /** Where each field came from — recorded in the emitted file header and the delta report. */
  provenance: {
    steps: "xlsx";
    stepsFilledFromDocx: number;
    roles: "docx" | "xlsx-names" | "none";
    overview: "xlsx" | "docx" | "none";
    masterData: "docx" | "none";
    succeeding: "docx" | "none";
    docxOverviewSteps: number;
  };
};

function key(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(optional\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function composeBpd(x: BpdXlsxParse, d: BpdDocxParse | null): ComposedBpd {
  const byName = new Map<string, { role: string; app: string; expected: string }>();
  for (const s of d?.overviewSteps ?? []) {
    // A "Group: Step" xlsx title matches a docx row named by the step alone.
    byName.set(key(s.name), s);
  }
  let filled = 0;
  const process_steps = x.steps.map((s) => {
    const short = s.name.includes(": ") ? s.name.slice(s.name.lastIndexOf(": ") + 2) : s.name;
    const fallback = byName.get(key(s.name)) ?? byName.get(key(short));
    const role = s.role || fallback?.role || "";
    const app = s.app || fallback?.app || "";
    const expected = fallback?.expected || s.expected || "";
    if (fallback && (!s.role || !s.app || fallback.expected)) filled++;
    return { name: s.name, role, app, expected };
  });

  const docxRoles = d?.businessRoles ?? [];
  const business_roles =
    docxRoles.length > 0
      ? docxRoles
      : Array.from(new Set(process_steps.map((s) => s.role).filter(Boolean))).map((name) => ({ name, id: "" }));

  const apps = new Set<string>(process_steps.map((s) => s.app).filter(Boolean));
  for (const s of d?.overviewSteps ?? []) if (s.app) apps.add(s.app);

  const overview = x.overview || d?.overview || "";
  return {
    code: x.code,
    title: x.title || d?.title || x.code,
    overview,
    business_roles,
    fiori_apps: Array.from(apps),
    process_steps,
    master_data: d?.masterData ?? [],
    succeeding_processes: d?.succeedingProcesses ?? [],
    provenance: {
      steps: "xlsx",
      stepsFilledFromDocx: filled,
      roles: docxRoles.length > 0 ? "docx" : business_roles.length > 0 ? "xlsx-names" : "none",
      overview: x.overview ? "xlsx" : d?.overview ? "docx" : "none",
      masterData: (d?.masterData.length ?? 0) > 0 ? "docx" : "none",
      succeeding: (d?.succeedingProcesses.length ?? 0) > 0 ? "docx" : "none",
      docxOverviewSteps: d?.overviewSteps.length ?? 0,
    },
  };
}
