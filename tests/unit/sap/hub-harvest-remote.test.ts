/**
 * The harvested artifacts can reach a deployed instance — pinned, or refused.
 *
 * WHAT WAS WRONG. #218 committed 7,147 individual SAP artifacts and NOTHING IN
 * `src/` READ THEM. They were importable only by a local script holding a
 * database URL, so a deployed catalogue showed the curated set and nothing said
 * why. The fix could not be "bundle them like the curated files": those are
 * statically imported into every serverless function, and INTEGRATION.json
 * alone is 2.4MB.
 *
 * WHAT THIS FILE PINS:
 *
 *   1. The ref is a full commit SHA or the import is REFUSED. A branch moves,
 *      so rows fetched from it could come from code the running instance has
 *      never seen — and the resulting catalogue looks identical either way.
 *      That is the defect shape this codebase keeps finding: a claim with
 *      nothing verifying it.
 *
 *   2. A non-JSON answer is reported as a wrong URL, not as a corrupt
 *      catalogue. GitHub answers a missing path with HTML; `JSON.parse` on it
 *      throws about an unexpected token, which sends a reader to the data.
 *
 *   3. `nextOffset` says whether the import finished. An operator asks "is it
 *      done?", and a response reporting only how many rows were written answers
 *      a different question.
 *
 *   4. The type list and the committed files agree, checked through
 *      `git ls-files` rather than the disk — the same check that has now caught
 *      three gitignore mistakes.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { HUB_CONTENT_TYPE_META } from "@/lib/sap-public/hub-content";
import {
  HARVEST_CHUNK_DEFAULT,
  HARVEST_CHUNK_MAX,
  HARVEST_REPO_PATH,
  HARVEST_TYPES,
  fetchHarvestRows,
  harvestFileUrl,
  isHarvestType,
  resolveHarvestSource,
  sliceHarvest,
} from "@/lib/sap-public/hub-harvest-remote";

const ROOT = resolve(__dirname, "../../..");
const SHA = "0123456789abcdef0123456789abcdef01234567";

const env = (over: Record<string, string | undefined>) =>
  ({ VERCEL_GIT_REPO_OWNER: "ib823", VERCEL_GIT_REPO_SLUG: "aptus", ...over }) as unknown as NodeJS.ProcessEnv;

describe("the source commit is pinned, or the import refuses", () => {
  it("accepts a full 40-character SHA", () => {
    const src = resolveHarvestSource(env({ VERCEL_GIT_COMMIT_SHA: SHA }));
    expect(src).toEqual({ repo: "ib823/aptus", ref: SHA, refSource: "VERCEL_GIT_COMMIT_SHA" });
  });

  it("REFUSES a branch name, which is the whole point", () => {
    /*
     * The tempting fallback is `main`: it works in every manual test and makes
     * the endpoint feel finished. It also makes "which snapshot is in this
     * database?" unanswerable again — the exact gap the harvest provenance
     * block was written to close.
     */
    for (const ref of ["main", "HEAD", "v1.2.3", "43cc8d5"]) {
      const src = resolveHarvestSource(env({ HUB_HARVEST_REF: ref }));
      expect(src, `ref "${ref}" must be refused`).toHaveProperty("reason");
      if ("reason" in src) expect(src.reason).toMatch(/40-character/);
    }
  });

  it("refuses with a reason when no SHA is available at all", () => {
    const src = resolveHarvestSource(env({ VERCEL_GIT_COMMIT_SHA: undefined, HUB_HARVEST_REF: undefined }));
    expect(src).toHaveProperty("reason");
    // The reason must name the fix, not merely the fault.
    if ("reason" in src) expect(src.reason).toMatch(/HUB_HARVEST_REF|sap:hub:import/);
  });

  it("refuses when no repository is known", () => {
    const src = resolveHarvestSource({
      VERCEL_GIT_COMMIT_SHA: SHA,
      VERCEL_GIT_REPO_OWNER: undefined,
      VERCEL_GIT_REPO_SLUG: undefined,
    } as unknown as NodeJS.ProcessEnv);
    expect(src).toHaveProperty("reason");
    if ("reason" in src) expect(src.reason).toMatch(/HUB_HARVEST_REPO/);
  });

  it("an explicit ref wins over the platform one, and says so", () => {
    const other = "fedcba9876543210fedcba9876543210fedcba98";
    const src = resolveHarvestSource(env({ VERCEL_GIT_COMMIT_SHA: SHA, HUB_HARVEST_REF: other }));
    expect(src).toEqual({ repo: "ib823/aptus", ref: other, refSource: "HUB_HARVEST_REF" });
  });

  it("builds a raw URL at that exact commit", () => {
    const src = resolveHarvestSource(env({ VERCEL_GIT_COMMIT_SHA: SHA }));
    if ("reason" in src) throw new Error(src.reason);
    expect(harvestFileUrl(src, "EVENT")).toBe(
      `https://raw.githubusercontent.com/ib823/aptus/${SHA}/${HARVEST_REPO_PATH}/EVENT.json`,
    );
  });
});

describe("a wrong URL reads as a wrong URL", () => {
  const stub = (body: string, ok = true, status = 200) =>
    (async () => new Response(body, { status: ok ? status : status })) as unknown as typeof fetch;

  it("reports the HTTP status, and what it usually means", async () => {
    const res = await fetchHarvestRows("https://x/EVENT.json", stub("Not Found", false, 404));
    expect(res).toHaveProperty("error");
    if ("error" in res) {
      expect(res.error).toMatch(/HTTP 404/);
      expect(res.error).toMatch(/predate|public/);
    }
  });

  it("does not surface a JSON parse error for an HTML body", async () => {
    const res = await fetchHarvestRows("https://x/EVENT.json", stub("<!DOCTYPE html><html>404</html>"));
    expect(res).toHaveProperty("error");
    if ("error" in res) {
      expect(res.error).toMatch(/did not return JSON/);
      expect(res.error).not.toMatch(/unexpected token/i);
    }
  });

  it("refuses an object where an array of rows belongs", async () => {
    const res = await fetchHarvestRows("https://x/EVENT.json", stub('{"rows":[]}'));
    expect(res).toHaveProperty("error");
    if ("error" in res) expect(res.error).toMatch(/expected a top-level array/);
  });

  it("returns rows for a well-formed array", async () => {
    const res = await fetchHarvestRows("https://x/EVENT.json", stub('[{"externalId":"A"},{"externalId":"B"}]'));
    expect(res).toEqual({ rows: [{ externalId: "A" }, { externalId: "B" }] });
  });

  it("a network failure names the URL rather than throwing", async () => {
    const boom = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const res = await fetchHarvestRows("https://x/EVENT.json", boom);
    expect(res).toHaveProperty("error");
    if ("error" in res) expect(res.error).toMatch(/Could not reach https:\/\/x\/EVENT.json/);
  });
});

describe("chunking says whether it finished", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ externalId: `E${i}` }));

  it("reports the next offset while rows remain", () => {
    const c = sliceHarvest(rows, 0, 4);
    expect(c.rows).toHaveLength(4);
    expect(c.nextOffset).toBe(4);
    expect(c.total).toBe(10);
  });

  it("nextOffset is null exactly when the file is finished", () => {
    // The off-by-one that matters: the last full chunk ENDS the file, and a
    // caller told "next offset 10" would make one more pointless round trip and
    // could not tell an empty tail from a completed import.
    expect(sliceHarvest(rows, 8, 2).nextOffset).toBeNull();
    expect(sliceHarvest(rows, 6, 2).nextOffset).toBe(8);
    expect(sliceHarvest(rows, 10, 4).nextOffset).toBeNull();
    expect(sliceHarvest(rows, 10, 4).rows).toHaveLength(0);
  });

  it("clamps a hostile limit instead of trusting it", () => {
    expect(sliceHarvest(rows, 0, 999999).limit).toBe(HARVEST_CHUNK_MAX);
    expect(sliceHarvest(rows, 0, 0).limit).toBe(HARVEST_CHUNK_DEFAULT);
    expect(sliceHarvest(rows, -5, 3).offset).toBe(0);
    expect(sliceHarvest(rows, Number.NaN, Number.NaN).offset).toBe(0);
  });
});

describe("the type list matches what is actually committed", () => {
  it("every harvest type is a real content type", () => {
    for (const t of HARVEST_TYPES) expect(Object.keys(HUB_CONTENT_TYPE_META)).toContain(t);
    expect(HARVEST_TYPES.every(isHarvestType)).toBe(true);
    expect(isHarvestType("CDS_VIEW")).toBe(false);
  });

  it("agrees with the git-tracked files, in both directions", () => {
    /*
     * Through `git ls-files`, not the disk: `/sap-references/*` is gitignored
     * and this directory needed an explicit negation. A disk check passes
     * locally and fails in CI on a fresh clone — which has shipped once and
     * been caught three times by this exact assertion.
     */
    const tracked = execFileSync("git", ["ls-files", `${HARVEST_REPO_PATH}/`], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter((l) => l.endsWith(".json"))
      .map((l) => l.split("/").pop()!.replace(".json", ""))
      .sort();
    expect(tracked).toEqual([...HARVEST_TYPES].sort());
  });
});
