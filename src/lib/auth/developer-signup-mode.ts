/**
 * COREEDGE_DEVELOPER_SIGNUP, read on its own (roadmap P0.13).
 *
 * Its own module, importing nothing, because the EDGE reads it too: the
 * middleware gives POST /api/auth/signup its own tight bucket only while
 * developer sign-up is open (wave 1a integration review), and the rest of
 * lib/auth/developer-workspace.ts needs Prisma and node:crypto, which the edge
 * runtime cannot load. developer-workspace.ts re-exports both names, so every
 * other caller is unchanged.
 */

export type DeveloperSignupMode = "off" | "open";

/** process.env, or any plain map of the same variables (tests pass one). */
type EnvVars = Readonly<Record<string, string | undefined>>;

/** The mode in force. Only the exact word `open` opens it. */
export function developerSignupMode(env: EnvVars = process.env): DeveloperSignupMode {
  return env.COREEDGE_DEVELOPER_SIGNUP?.trim().toLowerCase() === "open" ? "open" : "off";
}
