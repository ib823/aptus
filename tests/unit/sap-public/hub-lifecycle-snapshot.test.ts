/**
 * P0.8 — the lifecycle snapshot parser, the deploy switch, and where the stamp
 * sits in the deploy. The SQL itself is proved against real PostgreSQL in
 * tests/integration/catalogue-lifecycle-and-addresses.test.ts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TENANT_ANCHORED_MODELS } from "@/lib/db/tenant-guard";
import {
  applyHubLifecycle,
  hubLifecycleOnDeploy,
  HUB_LIFECYCLE_SNAPSHOT_PATH,
  parseHubLifecycleSnapshot,
  STAMP_API_REFERENCE_SQL,
  STAMP_HUB_CONTENT_SQL,
} from "@/lib/sap-public/hub-lifecycle-snapshot";

const ROOT = join(__dirname, "../../..");

describe("parseHubLifecycleSnapshot", () => {
  it("takes only an explicit hubState — a release status is not a lifecycle state", () => {
    const snap = parseHubLifecycleSnapshot({
      _provenance: { source: "https://api.sap.com/odata/1.0/catalog.svc", harvestedAt: "2026-09-05T11:38:07.392Z" },
      apis: [
        { apiId: "A", hubState: "deprecated", hubVersion: "1.0.0", hubModifiedAt: "2026-07-17T16:24:47.977Z" },
        { apiId: "B", status: "Released" }, // no hubState → not a record
        { apiId: "", hubState: "ACTIVE" },
        { hubState: "ACTIVE" },
        null,
      ],
    });
    expect(snap.source).toBe("https://api.sap.com/odata/1.0/catalog.svc");
    expect(snap.harvestedAt).toBe("2026-09-05T11:38:07.392Z");
    expect(snap.records).toEqual([
      {
        externalId: "A",
        hubState: "DEPRECATED",
        hubVersion: "1.0.0",
        hubModifiedAt: "2026-07-17T16:24:47.977Z",
        hubSubType: null,
        catalogueRelease: null,
        successorExternalId: null,
      },
    ]);
  });

  it("fills a successor only from the committed SAP-named map, never from a name", () => {
    const snap = parseHubLifecycleSnapshot({
      apis: [
        { apiId: "API_PURCHASEORDER_PROCESS_SRV", hubState: "DEPRECATED" },
        { apiId: "API_SOMETHING_SRV", hubState: "DEPRECATED" }, // a _0002 may exist; not inferred
      ],
    });
    const by = new Map(snap.records.map((r) => [r.externalId, r.successorExternalId]));
    expect(by.get("API_PURCHASEORDER_PROCESS_SRV")).toBe("CE_PURCHASEORDER_0001");
    expect(by.get("API_SOMETHING_SRV")).toBeNull();
  });

  it("keeps one record per id, the later Hub modification", () => {
    const snap = parseHubLifecycleSnapshot([
      { apiId: "A", hubState: "ACTIVE", hubModifiedAt: "2026-08-01T00:00:00Z" },
      { apiId: "A", hubState: "DEPRECATED", hubModifiedAt: "2026-09-01T00:00:00Z" },
      { apiId: "A", hubState: "BETA", hubModifiedAt: "2026-01-01T00:00:00Z" },
    ]);
    expect(snap.records).toHaveLength(1);
    expect(snap.records[0]!.hubState).toBe("DEPRECATED");
  });

  it("reads the committed snapshot: every API with its state, 221 DEPRECATED, dated", () => {
    const snap = parseHubLifecycleSnapshot(JSON.parse(readFileSync(join(ROOT, HUB_LIFECYCLE_SNAPSHOT_PATH), "utf8")));
    expect(snap.records.length).toBeGreaterThan(5000);
    expect(snap.records.filter((r) => r.hubState === "DEPRECATED").length).toBe(221);
    expect(snap.harvestedAt).toMatch(/^2026-09-05/);
  });
});

describe("the deploy switch (HUB_LIFECYCLE_ON_DEPLOY)", () => {
  it("defaults to apply; 'off' skips; anything else applies with a warning", () => {
    expect(hubLifecycleOnDeploy({})).toEqual({ mode: "apply", warning: null });
    expect(hubLifecycleOnDeploy({ HUB_LIFECYCLE_ON_DEPLOY: "apply" })).toEqual({ mode: "apply", warning: null });
    expect(hubLifecycleOnDeploy({ HUB_LIFECYCLE_ON_DEPLOY: " OFF " })).toEqual({ mode: "off", warning: null });
    const typo = hubLifecycleOnDeploy({ HUB_LIFECYCLE_ON_DEPLOY: "of" });
    expect(typo.mode).toBe("apply");
    expect(typo.warning).toMatch(/not "apply" or "off"/);
  });

  it("is documented in .env.example", () => {
    expect(readFileSync(join(ROOT, ".env.example"), "utf8")).toMatch(/^#?\s*HUB_LIFECYCLE_ON_DEPLOY=/m);
  });
});

describe("the stamp in the deploy", () => {
  it("vercel-build runs it after the migrations and before the build, with no network", () => {
    const build = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> })
      .scripts["vercel-build"]!;
    const migrate = build.indexOf("migrate-deploy-with-retry");
    const stamp = build.indexOf("tsx scripts/apply-hub-lifecycle.ts");
    expect(migrate).toBeGreaterThan(-1);
    expect(stamp).toBeGreaterThan(migrate);
    expect(stamp).toBeLessThan(build.indexOf("next build"));
    const script = readFileSync(join(ROOT, "scripts/apply-hub-lifecycle.ts"), "utf8");
    expect(script).not.toMatch(/\bfetch\(/);
  });

  it("each statement updates existing rows only, never updatedAt or rawMetadataJson", () => {
    for (const sql of [STAMP_API_REFERENCE_SQL, STAMP_HUB_CONTENT_SQL]) {
      expect(sql).toMatch(/^\s*UPDATE /);
      expect(sql).not.toMatch(/INSERT|DELETE/i);
      expect(sql).not.toMatch(/"updatedAt"\s*=/);
      expect(sql).not.toMatch(/"rawMetadataJson"/);
      expect(sql).toMatch(/COALESCE\(t\."successorExternalId"/);
    }
    expect(STAMP_HUB_CONTENT_SQL).toMatch(/t\."contentType" = 'API'/);
  });

  it("sends nothing for an empty snapshot", async () => {
    const calls: string[] = [];
    const db = { $executeRawUnsafe: async (q: string) => (calls.push(q), 0) };
    expect(await applyHubLifecycle(db, [])).toEqual({ apiReferenceRows: 0, hubContentRows: 0 });
    expect(calls).toHaveLength(0);
  });
});

describe("the V4 address record is tenant-anchored (definition of done)", () => {
  it("is in TENANT_ANCHORED_MODELS, so every query on it must name an organization", () => {
    expect(TENANT_ANCHORED_MODELS as readonly string[]).toContain("CatalogueAddressVerification");
  });
});
