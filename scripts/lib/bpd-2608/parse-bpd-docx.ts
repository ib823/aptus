/**
 * 2608 WS5 — fallback / complement parser for the SAP BPD test script in
 * its DOCUMENT form: `<CODE>_S4CLD2608_BPD_EN_<CC>.docx`.
 *
 * Reads word/document.xml directly (no mammoth: the mammoth ⇄ xmldom pair
 * pinned in this repo fails on these files) and walks the body in order,
 * keeping headings and tables. It recovers what the structured xlsx does not
 * carry:
 *   - Roles table          → business_roles {name, id}
 *   - Master data table    → master_data {data, sample, details}
 *   - Overview Table       → steps {name, role, app, expected} (SAP's own summary)
 *   - Succeeding Processes → succeeding_processes {raw, description}
 *   - Purpose paragraph    → overview
 *
 * Tables are recognised by their header cells, never by position, because
 * the number of "Note"/"Caution" one-cell tables varies per document.
 */
import path from "node:path";

import AdmZip from "adm-zip";

export type DocxTable = { headers: string[]; rows: string[][]; heading: string };

export type BpdDocxParse = {
  code: string;
  file: string;
  title: string;
  overview: string;
  businessRoles: { name: string; id: string }[];
  masterData: { data: string; sample: string; details: string }[];
  overviewSteps: { name: string; role: string; app: string; expected: string }[];
  succeedingProcesses: { raw: string; description: string }[];
  /** Heading-2/3 titles under "Test Procedures", in order (the docx's own step list). */
  procedureHeadings: string[];
  tables: DocxTable[];
};

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Text of a run of WordprocessingML, paragraphs joined by "\n". */
function textOf(xml: string): string {
  const paras = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((p) =>
    [...p[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g)]
      .map((m) => (m[0] === "<w:tab/>" ? " " : decodeXml(m[1] ?? "")))
      .join(""),
  );
  // Paragraph breaks inside a cell are kept as "\n" (master-data details are
  // multi-paragraph); runs of spaces/tabs collapse.
  const joined =
    paras.length > 0
      ? paras.join("\n")
      : [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => decodeXml(m[1] ?? "")).join("");
  return joined
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** "Create Sales Inquiry  [page ] 61" → "Create Sales Inquiry" (the trailing number is the page reference). */
export function cleanStepName(s: string): string {
  return s
    .replace(/\s*\[\s*page[^\]]*\]\s*/gi, " ")
    .replace(/\s+\d{1,3}\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function norm(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

export function parseBpdDocxXml(xml: string, code: string, file: string): BpdDocxParse {
  const body = xml.slice(xml.indexOf("<w:body>"));
  const re = /<w:p[ >][\s\S]*?<\/w:p>|<w:tbl>[\s\S]*?<\/w:tbl>/g;
  const tables: DocxTable[] = [];
  let heading1 = "";
  let heading = "";
  let title = "";
  const purposeParas: string[] = [];
  const procedureHeadings: string[] = [];
  let inProcedures = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const chunk = m[0];
    if (chunk.startsWith("<w:tbl>")) {
      const trs = [...chunk.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((r) =>
        [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => textOf(c[0])),
      );
      if (trs.length === 0) continue;
      const [headers, ...rows] = trs;
      tables.push({ headers: headers ?? [], rows, heading });
      if (!title && tables.length === 1) {
        const cell = trs.map((r) => r.join(" ")).find((t) => /\(\w{3}_\w{2}\)/.test(t));
        title = (cell ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
      }
      continue;
    }
    const style = chunk.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
    const text = textOf(chunk);
    if (!text) continue;
    if (/^Heading1$/i.test(style) || /^SAPHeading1/i.test(style)) {
      heading1 = text;
      heading = text;
      inProcedures = /^test procedures$/i.test(text);
      continue;
    }
    if (/^Heading[23]$/i.test(style)) {
      heading = text;
      if (inProcedures) procedureHeadings.push(text);
      continue;
    }
    if (
      /^purpose$/i.test(heading1) &&
      !/title|toc/i.test(style) &&
      text.length > 40 &&
      !/^(Overview|Purpose)$/i.test(text)
    )
      purposeParas.push(text);
  }

  const find = (pred: (h: string[]) => boolean | undefined) => tables.find((t) => pred(t.headers.map(norm)));
  const roles = find(
    (h) => h[0] === "name role template" || (h.includes("name role template") && h.includes("id role template")),
  );
  const master = find(
    (h) =>
      (h[0] === "data" || h[0]?.startsWith("master org data")) && (h.includes("sample value") || h.includes("value")),
  );
  // The Overview Table is one table per section in the longer scripts (J59 /
  // J60 group their steps), so every table with its header shape counts.
  const isOverview = (h: string[]) =>
    h[0]?.startsWith("process step") === true && h.some((x) => x.startsWith("business role"));
  const overviewTbl = find(isOverview);
  const overviewTables = tables.filter((t) => isOverview(t.headers.map(norm)));
  const succTables = tables.filter(
    (t) => /succeeding/i.test(t.heading) && norm(t.headers[1] ?? "") === "business condition",
  );

  const idx = (t: DocxTable | undefined, pred: (h: string) => boolean) =>
    t ? t.headers.map(norm).findIndex(pred) : -1;
  const rIdName = idx(roles, (h) => h === "name role template");
  const rIdId = idx(roles, (h) => h === "id role template");
  const mData = idx(master, (h) => h === "data" || h.startsWith("master org data"));
  const mSample = idx(master, (h) => h === "sample value" || h === "value");
  const mDetails = idx(master, (h) => h.includes("details"));
  const oName = idx(overviewTbl, (h) => h.startsWith("process step"));
  const oRole = idx(overviewTbl, (h) => h.startsWith("business role"));
  const oApp = idx(overviewTbl, (h) => h.startsWith("app") || h.includes("transaction"));
  const oExp = idx(overviewTbl, (h) => h.startsWith("expected"));

  return {
    code,
    file,
    title,
    overview: purposeParas[0] ?? "",
    businessRoles: roles
      ? roles.rows
          .map((r) => ({ name: (r[rIdName] ?? "").trim(), id: (r[rIdId] ?? "").trim() }))
          .filter((r) => r.name && !/^country specific subrole/i.test(r.name))
      : [],
    masterData: master
      ? master.rows
          .map((r) => ({
            data: (r[mData] ?? "").trim(),
            sample: (r[mSample] ?? "").trim(),
            details: (r[mDetails] ?? "").trim(),
          }))
          .filter((r) => r.data)
      : [],
    overviewSteps: overviewTables.flatMap((t) =>
      t.rows
        .map((r) => ({
          name: cleanStepName(r[oName] ?? ""),
          role: (r[oRole] ?? "").trim(),
          app: (r[oApp] ?? "").trim(),
          expected: (r[oExp] ?? "").trim(),
        }))
        .filter((r) => r.name),
    ),
    succeedingProcesses: succTables.flatMap((t) =>
      t.rows.map((r) => ({ raw: (r[0] ?? "").trim(), description: (r[1] ?? "").trim() })).filter((r) => r.raw),
    ),
    procedureHeadings,
    tables,
  };
}

export function parseBpdDocx(file: string, code: string, cwd = process.cwd()): BpdDocxParse {
  const zip = new AdmZip(path.resolve(cwd, file));
  const xml = zip.readAsText("word/document.xml");
  if (!xml) throw new Error(`${file}: no word/document.xml`);
  return parseBpdDocxXml(xml, code, file);
}
