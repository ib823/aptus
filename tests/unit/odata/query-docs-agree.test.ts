// @vitest-environment node
/**
 * What the query surface's documents tell people, checked against the code
 * that decides it (P1.4a review).
 *
 *   - The developer guide's value forms: every timestamp it shows is one the
 *     grammar accepts, and it shows one for each timestamp type. It showed
 *     only `2026-01-01T09:30:00`, which `Edm.DateTimeOffset` (the usual V4
 *     timestamp) refuses: it needs seconds and Z or an offset.
 *   - The circuit runbook's table: a key lookup that finds no record is an
 *     answer, and closes the circuit (circuitOutcomeForQuery reports it ok,
 *     half-open probe included); the table had it counting nothing.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { circuitOutcomeForQuery } from "@/lib/governed/pipeline";
import { parseLiteral } from "@/lib/odata/literals";

const read = (file: string) => readFileSync(path.resolve(__dirname, "../../..", file), "utf8");

describe("the developer guide's value forms", () => {
  const guide = read("docs/coreedge-developer-guide.md");
  const paragraph = guide.slice(guide.indexOf("Filters on different fields are ANDed."), guide.indexOf("CoreEdge builds the OData query itself."));
  const stamps = [...paragraph.matchAll(/`(\d{4}-\d{2}-\d{2}T[^`]+)`/g)].map((m) => decodeURIComponent(m[1]!));

  it("every timestamp shown is accepted for a timestamp type, and each type has one", () => {
    expect(stamps.length).toBeGreaterThan(0);
    const accepted = (t: "DT" | "DTO") => stamps.filter((s) => parseLiteral(t, s).ok);
    for (const s of stamps) expect(parseLiteral("DT", s).ok || parseLiteral("DTO", s).ok, s).toBe(true);
    expect(accepted("DT").length).toBeGreaterThan(0);
    expect(accepted("DTO").length).toBeGreaterThan(0);
  });
});

describe("the circuit runbook's table", () => {
  const rows = read("docs/runbooks/coreedge-circuit-breaker.md")
    .split("\n")
    .filter((l) => l.startsWith("| "));
  const rowSaying = (text: string) => rows.filter((r) => r.includes(text));

  it("puts a key lookup that finds no record with the answers that close the circuit", () => {
    expect(circuitOutcomeForQuery({ status: "NO_RECORD", httpStatus: 404 })).toBe("ok");
    const noRecord = rowSaying("finds no record");
    expect(noRecord).toHaveLength(1);
    expect(noRecord[0]).toContain("Closes; the failure count goes back to 0");
  });
});
