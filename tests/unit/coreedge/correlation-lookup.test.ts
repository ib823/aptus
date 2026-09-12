/**
 * Correlation ID lookup (PR-5, capability 9).
 *
 * The audit found the id generated, returned and stored — and UNQUERYABLE: "no
 * index on correlationId … and no endpoint accepts it as a filter". So "a
 * builder pastes one ID and gets an answer" meant a sequential scan or a log
 * grep, and log-grepping is not a substitute: it needs access nobody outside
 * operations has, and it returns lines rather than facts.
 *
 * The assertions here are mostly about what the answer must NOT contain, and
 * about the index that makes it tenant-scoped by construction rather than by a
 * filter someone can forget.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CORRELATION_WINDOW_DAYS } from "@/lib/coreedge/correlation-lookup";

const ROOT = process.cwd();
const SOURCE = readFileSync(path.resolve(ROOT, "src/lib/coreedge/correlation-lookup.ts"), "utf8");
const SCHEMA = readFileSync(path.resolve(ROOT, "prisma/schema.prisma"), "utf8");
const MIGRATION = readFileSync(
  path.resolve(ROOT, "prisma/migrations/20260912050000_correlation_id_lookup/migration.sql"),
  "utf8",
);

describe("the lookup is possible at all", () => {
  it("has an index keyed on the correlation id", () => {
    // Without this the endpoint exists and is a sequential scan of the audit
    // table, which is the same as not having it on any real dataset.
    expect(SCHEMA).toMatch(/@@index\(\[organizationId, correlationId\]\)/);
    expect(MIGRATION).toMatch(/CREATE INDEX[\s\S]*?"organizationId", "correlationId"/);
  });

  it("leads the index with the organization, so scoping is structural", () => {
    /*
     * Not a filter applied after the fetch — what the fetch is keyed on. A
     * tenant filter someone can forget to add is a tenant filter someone will
     * eventually forget to add.
     */
    expect(SOURCE).toMatch(/where:\s*\{\s*organizationId,\s*correlationId/);
  });

  it("covers the window the design states", () => {
    expect(CORRELATION_WINDOW_DAYS).toBe(30);
  });
});

describe("the answer carries no payload", () => {
  it("selects no request or response body", () => {
    /*
     * THE ASSERTION THIS FILE EXISTS FOR. An audit trail that leaked payloads
     * would be its own incident — a worse one than the problem it solves,
     * because it would be systematic, retained, and queryable by id.
     */
    const select = SOURCE.slice(SOURCE.indexOf("select: {"), SOURCE.indexOf("orderBy"));
    for (const forbidden of ["body", "payload", "request", "response", "fields", "data:"]) {
      expect(select.toLowerCase(), `the lookup selects ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("returns no field values in its result type", () => {
    const iface = SOURCE.slice(
      SOURCE.indexOf("export interface CorrelatedCall"),
      SOURCE.indexOf("function hopFor"),
    );
    expect(iface).toContain("brokenHop");
    expect(iface).toContain("rowCount");
    for (const forbidden of ["payload", "body", "values", "rows:"]) {
      expect(iface.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("reports a row COUNT, which is not a row", () => {
    // How many is a fact about the call. What they contained is the customer's
    // data and has no business in an audit lookup.
    expect(SOURCE).toMatch(/rowCount: number \| null/);
  });
});

describe("'wrong id' and 'aged out' are different answers", () => {
  it("has a distinct outcome for each", () => {
    // They send the reader to different places: one means check the id, the
    // other means the evidence is gone and no amount of checking will help.
    expect(SOURCE).toContain('kind: "not-found"');
    expect(SOURCE).toContain('kind: "outside-window"');
  });

  it("does not run a second scan to explain a miss", () => {
    // Counting the whole table to answer "no match" would be exactly the scan
    // this index exists to avoid.
    // Comments stripped first: the block's own explanation contains the word
    // "count", and prose describing a rule is not the rule being broken. This
    // is the third time in this work that an un-stripped source assertion has
    // flagged its own documentation.
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    const afterMiss = code.slice(code.indexOf("if (row === null)"));
    expect(afterMiss.slice(0, afterMiss.indexOf("}"))).not.toContain("count");
  });
});

describe("the hop is derived, not guessed", () => {
  it("separates a binding refusal from an SAP refusal on the same status", () => {
    /*
     * Both are 403 and they have different owners — the platform admin versus
     * the client's SAP admin. Collapsing them sends half of all triage to the
     * wrong person, which is the same reason the vocabulary keeps them apart.
     */
    expect(SOURCE).toMatch(/status === 403 && bindingRefusal !== null/);
    expect(SOURCE).toMatch(/return "binding"/);
  });

  it("puts a rate-limited call on the key hop, where it stopped", () => {
    // 429 never reached SAP. Attributing it to the read would be a claim about
    // where the call stopped that is simply false.
    expect(SOURCE).toMatch(/status === 429\) return "key"/);
  });

  it("names no broken hop for a success", () => {
    expect(SOURCE).toMatch(/status >= 200 && status < 300\) return null/);
  });
});
