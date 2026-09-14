/**
 * GET: which build is serving this request.
 *
 * WHY THIS EXISTS. "Is the merge live yet?" had no answer a tool could give.
 * Confirming a deploy meant reasoning: the login page's asset hashes stayed
 * byte-identical across four consecutive production deployments, because the
 * changes lived under auth-gated routes that no public page loads — so an
 * unchanged hash proved nothing, and a changed one only ever proved SOMETHING
 * was rebuilt. The runtime log's `dep=` identifies the deployment but nothing
 * maps a deployment id back to a commit. This closes that gap: one request,
 * one answer, no inference.
 *
 * PUBLIC AND UNAUTHENTICATED, deliberately. A check that needs a credential is
 * a check nobody runs during an incident, and the value here is an opaque
 * commit hash — it identifies a build, and grants nothing without access to the
 * repository that contains it. Nothing else is exposed: no env var names, no
 * versions, no configuration.
 *
 * NEVER CACHED. A CDN-cached build stamp would report the previous deploy after
 * the new one went live, which is precisely the failure this endpoint exists to
 * detect. `force-dynamic` plus no-store, and the headers are asserted by a test.
 *
 * VALUES COME FROM VERCEL'S OWN DEPLOYMENT ENVIRONMENT, so they describe the
 * build that is answering rather than anything this code computed. Unset
 * locally, where the honest answer is null rather than a guess.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Absent rather than empty: "not set" and "set to nothing" are different. */
function envOrNull(name: string): string | null {
  const value = process.env[name]?.trim();
  return value === undefined || value === "" ? null : value;
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      /* The commit this build was made from — the answer to "is it live". */
      commit: envOrNull("VERCEL_GIT_COMMIT_SHA"),
      ref: envOrNull("VERCEL_GIT_COMMIT_REF"),
      /*
       * The id that appears as `dep=` in Vercel's runtime logs. Returning it
       * beside the commit is what makes a log line traceable to a revision
       * without a second tool.
       */
      deployment: envOrNull("VERCEL_DEPLOYMENT_ID"),
      environment: envOrNull("VERCEL_ENV"),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
