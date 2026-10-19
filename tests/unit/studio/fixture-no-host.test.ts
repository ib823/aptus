/**
 * A starter kit's fixtures never carry the tenant's host.
 *
 * Fixture capture is the one sink of tenant rows that leaves the product: the
 * rows go into MockFixture, then into the kit's fixtures.json, then out of
 * `npm run mock` into the developer's code and CI. V2 rows carried
 * `__metadata.uri` and a `__deferred.uri` per navigation — absolute URLs on the
 * tenant — and capture stored them as they were, while schema capture, fed the
 * same rows, had always dropped them. The kit's warning describes "master data,
 * identifiers, amounts" and never the hostname, because nobody meant to ship it.
 */

import { describe, expect, it } from "vitest";

import { buildFixtureBody } from "@/lib/studio/fixtures";
import { buildScaffold, type ScaffoldFixture } from "@/lib/studio/scaffold";
import { inferResponseSchema } from "@/lib/studio/schema-capture";

const HOST = "my403706-api.s4hana.cloud.sap";
const SVC = `https://${HOST}/sap/opu/odata/sap/API_BUSINESS_PARTNER`;

const V2_ROW = {
  __metadata: { id: `${SVC}/A_BusinessPartner('1')`, uri: `${SVC}/A_BusinessPartner('1')`, type: "T" },
  BusinessPartner: "1",
  BusinessPartnerName: "Acme",
  to_BusinessPartnerAddress: { __deferred: { uri: `${SVC}/A_BusinessPartner('1')/to_BusinessPartnerAddress` } },
};

const IFACE = {
  id: "if_1",
  name: "BP - Read",
  externalId: "API_BUSINESS_PARTNER",
  sapProduct: "s4hana",
  operation: "READ",
  entitySet: "A_BusinessPartner",
  version: 1,
  solutionName: "QA-Solution",
} as never;

function fixturesJson(fixtures: readonly ScaffoldFixture[]): string {
  const file = buildScaffold(IFACE, undefined, fixtures).find((f) => f.path === "fixtures.json");
  expect(file, "the scaffold must still emit fixtures.json").toBeDefined();
  return file!.contents;
}

describe("capturing a data fixture", () => {
  it("records the business fields and not SAP's envelope", () => {
    const body = buildFixtureBody("data", [V2_ROW]);
    expect(body.records).toEqual([{ BusinessPartner: "1", BusinessPartnerName: "Acme" }]);
    expect(JSON.stringify(body)).not.toContain(HOST);
  });

  it("produces a kit whose fixtures.json does not name the host", () => {
    const contents = fixturesJson([
      {
        scenario: "data",
        status: 200,
        body: buildFixtureBody("data", [V2_ROW]),
        sourceStatus: 200,
        capturedAt: "2026-10-01T00:00:00.000Z",
      },
    ]);
    expect(contents).not.toContain(HOST);
    expect(contents).toContain("BusinessPartnerName");
  });
});

describe("a fixture stored before capture stripped the envelope", () => {
  /*
   * Already in MockFixture, host and all. Fixing capture alone would leave
   * every regenerated kit shipping it until somebody re-recorded, so the kit
   * cleans it on the way out.
   */
  it("is cleaned when the kit is built, without a re-capture", () => {
    const contents = fixturesJson([
      {
        scenario: "data",
        status: 200,
        body: { records: [V2_ROW], count: 1, empty: false, note: "1 record." },
        sourceStatus: 200,
        capturedAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
    expect(contents).not.toContain(HOST);
    const parsed = JSON.parse(contents) as { fixtures: { body: { records: unknown[]; count: number } }[] };
    expect(parsed.fixtures[0]?.body.records).toEqual([{ BusinessPartner: "1", BusinessPartnerName: "Acme" }]);
    // The rest of the stored body is untouched.
    expect(parsed.fixtures[0]?.body.count).toBe(1);
  });

  it("leaves an error-scenario body exactly as stored", () => {
    const error = { error: { code: "FORBIDDEN", message: "No.", correlationId: "fixture-needs-setup" } };
    const parsed = JSON.parse(
      fixturesJson([{ scenario: "needs_setup", status: 403, body: error, sourceStatus: 403, capturedAt: null }]),
    ) as { fixtures: { body: unknown }[] };
    expect(parsed.fixtures[0]?.body).toEqual(error);
  });
});

describe("the captured contract describes the rows that are served", () => {
  it("does not describe an unexpanded navigation the broker no longer serves", () => {
    const s = inferResponseSchema([V2_ROW], new Date());
    expect(Object.keys(s!.properties)).toEqual(["BusinessPartner", "BusinessPartnerName"]);
  });

  it("drops every @odata.* key, not only the two it used to list", () => {
    const s = inferResponseSchema([{ "@odata.id": `${SVC}/X('1')`, "_Item@odata.navigationLink": "x", ID: "1" }], new Date());
    expect(Object.keys(s!.properties)).toEqual(["ID"]);
  });
});
