/**
 * Which build is serving this request, from Vercel's own deployment
 * environment.
 *
 * ONE READER FOR TWO SURFACES. `GET /api/build` answers "is the merge live
 * yet" with these four values, and Control Tower's parity scorecard (P1.9)
 * prints the same commit beside the figures it renders, so the two can never
 * name different builds. Vercel documents all four as available at build and
 * at runtime when system environment variables are exposed; they are read at
 * request time, so they describe the deployment that is answering rather than
 * anything this code computed.
 *
 * Unset locally, where the honest answer is null rather than a guess.
 */

export interface BuildStamp {
  /** The commit this build was made from: the answer to "is it live". */
  commit: string | null;
  ref: string | null;
  /**
   * The id that appears as `dep=` in Vercel's runtime logs. Returning it
   * beside the commit is what makes a log line traceable to a revision
   * without a second tool.
   */
  deployment: string | null;
  environment: string | null;
}

/** Absent rather than empty: "not set" and "set to nothing" are different. */
function envOrNull(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value === undefined || value === "" ? null : value;
}

export function readBuildStamp(env: NodeJS.ProcessEnv = process.env): BuildStamp {
  return {
    commit: envOrNull(env, "VERCEL_GIT_COMMIT_SHA"),
    ref: envOrNull(env, "VERCEL_GIT_COMMIT_REF"),
    deployment: envOrNull(env, "VERCEL_DEPLOYMENT_ID"),
    environment: envOrNull(env, "VERCEL_ENV"),
  };
}
