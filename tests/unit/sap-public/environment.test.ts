/**
 * The SAP environment vocabulary (audit E15 P1, settled decision D1).
 *
 * `SapConnection.environment` was TEXT and matched by upper-casing a string. It
 * is now an enum, and the two things worth pinning are:
 *
 *   1. The parser and the MIGRATION agree. A spelling the migration converted
 *      must be accepted on the next save, and one it turned into NULL must not
 *      be quietly re-accepted here under a different rule. The migration's CASE
 *      arms are read out of the .sql file and compared against the parser, so
 *      the two cannot drift.
 *   2. NULL is undeclared, not "probably fine". `allowsUngrantedRead` is what
 *      caps a console read, and an undeclared landscape must not pass it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { $Enums } from "@prisma/client";

import {
  allowsUngrantedRead,
  ENVIRONMENT_VALUES,
  isSapEnvironment,
  isUnrecognisedEnvironment,
  parseSapEnvironment,
  UNGRANTED_READ_ENVIRONMENTS,
} from "@/lib/sap-public/environment";

const MIGRATION = path.resolve(
  process.cwd(),
  "prisma/migrations/20260912010000_sap_environment_enum/migration.sql",
);

describe("the vocabulary matches the database", () => {
  it("declares exactly the enum Prisma generated", () => {
    // The module re-declares the union rather than importing it, so that the
    // vocabulary carries no database dependency. This is the assertion that
    // makes that safe.
    expect([...ENVIRONMENT_VALUES].sort()).toEqual(Object.values($Enums.SapEnvironment).sort());
  });

  it("accepts every spelling the migration converted, and no others", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    // WHEN 'QAS' THEN 'TEST'::"SapEnvironment"
    const arms = [...sql.matchAll(/WHEN '([A-Z]+)'\s+THEN '([A-Z]+)'::"SapEnvironment"/g)];
    expect(arms.length).toBeGreaterThan(0);

    for (const [, from, to] of arms) {
      expect(parseSapEnvironment(from), `migration maps ${from} -> ${to}`).toBe(to);
    }

    // And the reverse direction: anything the parser accepts must be an arm, or
    // the next save would store a value the migration would have discarded.
    const accepted = new Set(arms.map(([, from]) => from));
    for (const candidate of ["STAGING", "UAT", "PRE-PROD", "SIT", "DEV2", "PROD "]) {
      if (accepted.has(candidate.trim().toUpperCase())) continue;
      expect(parseSapEnvironment(candidate), `${candidate} is not a migration arm`).toBeNull();
    }
  });
});

describe("parseSapEnvironment", () => {
  it("is case- and whitespace-insensitive", () => {
    expect(parseSapEnvironment(" dev ")).toBe("DEV");
    expect(parseSapEnvironment("Prod")).toBe("PROD");
    expect(parseSapEnvironment("qas")).toBe("TEST");
  });

  it("treats blank and absent as undeclared, not as a mistake", () => {
    for (const blank of ["", "   ", null, undefined]) {
      expect(parseSapEnvironment(blank)).toBeNull();
      expect(isUnrecognisedEnvironment(blank)).toBe(false);
    }
  });

  it("tells a typo apart from a blank", () => {
    // The connections form needs these to be different sentences: one is "you
    // left it out, which is allowed", the other is "that is not a landscape".
    expect(isUnrecognisedEnvironment("STAGING")).toBe(true);
    expect(isUnrecognisedEnvironment("DEV")).toBe(false);
  });

  it("isSapEnvironment accepts only canonical casing", () => {
    expect(isSapEnvironment("DEV")).toBe(true);
    expect(isSapEnvironment("dev")).toBe(false);
    expect(isSapEnvironment(null)).toBe(false);
  });
});

describe("the console read ceiling", () => {
  it("permits exactly Sandbox and Dev", () => {
    expect([...UNGRANTED_READ_ENVIRONMENTS].sort()).toEqual(["DEV", "SANDBOX"]);
    expect(allowsUngrantedRead("SANDBOX")).toBe(true);
    expect(allowsUngrantedRead("DEV")).toBe(true);
  });

  it("refuses TEST as firmly as PROD", () => {
    // A client's TEST system holds their data and answers to their change
    // control. "It is only test" is the sentence that precedes the incident.
    expect(allowsUngrantedRead("TEST")).toBe(false);
    expect(allowsUngrantedRead("PROD")).toBe(false);
  });

  it("refuses an undeclared landscape", () => {
    // The ceiling is "Sandbox and Dev are free". A system that will not say
    // which it is cannot be shown to be under the ceiling.
    expect(allowsUngrantedRead(null)).toBe(false);
  });
});
