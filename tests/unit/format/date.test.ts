/**
 * Dates must be unambiguous, and must not move between server and client.
 *
 * The product formatted them at least six ways, including `7/29/2026` on the
 * SAP catalogue and `31/07/2026` on the Governance Audit — the same three
 * numbers in opposite orders. `03/04/2026` is a valid date in both conventions
 * and a different day in each, which on a governance record is a real hazard
 * rather than a style inconsistency.
 */

import { describe, expect, it } from "vitest";

import {
  NO_DATE,
  formatDate,
  formatDateIso,
  formatDateTime,
  formatRelativeDays,
} from "@/lib/format/date";

const D = new Date("2026-07-29T14:05:09Z");

describe("formatDate", () => {
  it("names the month, so day and month cannot be transposed", () => {
    expect(formatDate(D)).toBe("29 Jul 2026");
  });

  it("is unambiguous on the dates that expose the US/UK split", () => {
    // 3 April, not 4 March — and the output says which without a legend.
    expect(formatDate(new Date("2026-04-03T00:00:00Z"))).toBe("3 Apr 2026");
    expect(formatDate(new Date("2026-03-04T00:00:00Z"))).toBe("4 Mar 2026");
  });

  it("accepts a Date, an ISO string, or an epoch number", () => {
    expect(formatDate("2026-07-29T14:05:09Z")).toBe("29 Jul 2026");
    expect(formatDate(D.getTime())).toBe("29 Jul 2026");
  });

  it("formats in UTC regardless of the ambient zone", () => {
    // Late-evening UTC would roll into the next day east of Greenwich. If this
    // read the local zone, a server-rendered page and its hydration would
    // disagree — a real hydration error, not a cosmetic one.
    expect(formatDate(new Date("2026-07-29T23:30:00Z"))).toBe("29 Jul 2026");
  });
});

describe("absent and unparseable values", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an unparseable string", "not a date"],
    ["NaN", Number.NaN],
  ])("renders %s as the no-date marker", (_label, value) => {
    // Never today's date, never an empty cell: a blank reads as "nothing
    // happened", and a substituted now() would be a fabricated fact.
    expect(formatDate(value as never)).toBe(NO_DATE);
    expect(formatDateTime(value as never)).toBe(NO_DATE);
    expect(formatDateIso(value as never)).toBe(NO_DATE);
  });
});

describe("formatDateTime", () => {
  it("uses a 24-hour clock, so there is no am/pm to misread", () => {
    expect(formatDateTime(D)).toContain("14:05");
    expect(formatDateTime(D)).toContain("29 Jul 2026");
    expect(formatDateTime(D).toLowerCase()).not.toContain("pm");
  });
});

describe("formatDateIso", () => {
  it("is sortable, for exports and filenames", () => {
    expect(formatDateIso(D)).toBe("2026-07-29");
    const dates = ["2026-01-05", "2025-12-31", "2026-07-29"].map((s) =>
      formatDateIso(new Date(s)),
    );
    expect([...dates].sort()).toEqual(["2025-12-31", "2026-01-05", "2026-07-29"]);
  });
});

describe("formatRelativeDays", () => {
  const now = new Date("2026-07-29T12:00:00Z");

  it.each([
    ["2026-07-29T12:00:00Z", "today"],
    ["2026-07-30T12:00:00Z", "tomorrow"],
    ["2026-07-28T12:00:00Z", "yesterday"],
    ["2026-08-04T12:00:00Z", "in 6 days"],
    ["2026-07-17T12:00:00Z", "12 days ago"],
  ])("renders %s as %s", (input, expected) => {
    expect(formatRelativeDays(new Date(input), now)).toBe(expected);
  });

  it("takes `now` from the caller so it is testable and hydration-safe", () => {
    const later = new Date("2026-08-29T12:00:00Z");
    expect(formatRelativeDays(new Date("2026-07-29T12:00:00Z"), later)).toBe("31 days ago");
  });
});
