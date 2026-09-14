/**
 * GET /api/build — the answer to "is the merge live yet".
 *
 * WHY IT NEEDED WRITING. Confirming a production deploy used to be inference.
 * The login page's asset hashes were byte-identical across four consecutive
 * production deployments — every change sat behind auth, so no public page
 * loaded any of it — which makes "the hash did not change" evidence of nothing
 * at all. The runtime log gives a deployment id and nothing maps that id to a
 * commit. These assert the endpoint answers directly and cannot go stale.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/build/route";

const VARS = [
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_GIT_COMMIT_REF",
  "VERCEL_DEPLOYMENT_ID",
  "VERCEL_ENV",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of VARS) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of VARS) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe("the build stamp reports the build that is answering", () => {
  it("returns the commit, the ref, the deployment and the environment", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "3c15c8bf29c48267ce51f7865e83959cd51e3c17";
    process.env.VERCEL_GIT_COMMIT_REF = "main";
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_FPPFkFn53QZdAbRpYSfxJV3zR95w";
    process.env.VERCEL_ENV = "production";

    const body = await (await GET()).json();

    expect(body).toEqual({
      commit: "3c15c8bf29c48267ce51f7865e83959cd51e3c17",
      ref: "main",
      // The id that appears as `dep=` in the runtime log. Returning it beside
      // the commit is what makes a log line traceable to a revision.
      deployment: "dpl_FPPFkFn53QZdAbRpYSfxJV3zR95w",
      environment: "production",
    });
  });

  it("says null rather than guessing when a value is not set", async () => {
    // Locally none of these exist. "Not set" is the honest answer; an empty
    // string would read as a commit whose sha happens to be blank.
    const body = await (await GET()).json();
    expect(body).toEqual({ commit: null, ref: null, deployment: null, environment: null });
  });

  it("treats an empty value as unset", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "   ";
    const body = await (await GET()).json();
    expect(body.commit).toBeNull();
  });

  it("is never cached", async () => {
    /*
     * THE FAILURE THIS PREVENTS IS THE ONE THE ENDPOINT EXISTS TO DETECT. A
     * CDN-cached stamp reports the previous deploy after the new one is live —
     * confidently, and wrongly, which is worse than no endpoint at all.
     */
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it("exposes nothing but the build's identity", async () => {
    // Public and unauthenticated, so the surface stays exactly four opaque
    // fields — no env var names, no versions, no configuration.
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123";
    const body = await (await GET()).json();
    expect(Object.keys(body).sort()).toEqual(["commit", "deployment", "environment", "ref"]);
  });
});
