/**
 * Self-service developer workspaces on the shared host (roadmap P0.13).
 *
 * THE GAP THIS CLOSES. A person who signed in by magic link with an address
 * nobody had invited got a `consultant` row with no organization: Studio
 * refuses a non-admin with no tenant (`lacksStudioTenantScope`), so the
 * account could open nothing CoreEdge offers. `/signup` created a
 * `partner_lead`, which cannot open Studio at all. Onboarding a developer
 * therefore needed an admin, an API call or a database edit.
 *
 * WHAT A WORKSPACE IS. The person's own Organization, with them in it as
 * `sandbox_developer`: Discover, the catalogue and the deployment's SAP API
 * Hub sandbox tenant, inviting colleagues into the same workspace, and no
 * governance right anywhere (lib/studio/rbac.ts, `isSandboxDeveloper`).
 *
 * OFF UNLESS SOMEONE TURNS IT ON. COREEDGE_DEVELOPER_SIGNUP:
 *   off  — the DEFAULT. Sign-up and magic-link sign-in admit exactly who they
 *          admitted before this existed (lib/auth/auth-config.ts,
 *          `canRegister`), and create exactly what they created before.
 *   open — a NEW person whose address passes the developer domain list
 *          (COREEDGE_DEVELOPER_SIGNUP_DOMAINS, empty = any domain) gets a
 *          developer workspace when they first sign in — whether they came
 *          through /signup/developer or the ordinary sign-in page. So does a
 *          new person `canRegister` admits: once sign-up is open, signing up
 *          never grants more than this. Existing accounts are untouched.
 * Anything else reads as off. That is the opposite of COREEDGE_STEP_UP, which
 * reads a typo as its middle setting, and deliberately so: a typo here must
 * not open the host to strangers.
 *
 * A VERIFIED ADDRESS BEFORE ANYTHING EXISTS. Nothing is written when someone
 * asks for a workspace except NextAuth's one-time verification token. The
 * workspace and its account are created in one transaction by the adapter's
 * `createUser`, which NextAuth calls only after the link in that email was
 * clicked — so an address nobody controls never gets a row, and there is no
 * half-made workspace to clean up.
 *
 * ABUSE. Asking for a workspace is limited per address
 * (`checkSignupEmailLimit`, here) and per caller address (middleware's
 * `signup:` bucket on POST /api/auth/signup). An invitation sent from a
 * workspace counts against its seats while it is pending
 * (lib/auth/org-invites.ts), so an open sign-up is not an open mail relay.
 */

import { createHash } from "node:crypto";

import type { User } from "@prisma/client";

import { canRegister } from "@/lib/auth/auth-config";
import { prisma } from "@/lib/db/prisma";
import { uniqueOrganizationSlug } from "@/lib/org/slug";
import { checkRateLimit, RATE_LIMITS, type RateLimitResult } from "@/lib/security/rate-limit";
import { isLimiterOutage } from "@/lib/security/rate-limit-response";

export type DeveloperSignupMode = "off" | "open";

/** process.env, or any plain map of the same variables (tests pass one). */
type EnvVars = Readonly<Record<string, string | undefined>>;

/** The mode in force. Only the exact word `open` opens it. */
export function developerSignupMode(env: EnvVars = process.env): DeveloperSignupMode {
  return env.COREEDGE_DEVELOPER_SIGNUP?.trim().toLowerCase() === "open" ? "open" : "off";
}

/** COREEDGE_DEVELOPER_SIGNUP_DOMAINS, lower-cased; empty means any domain. */
export function developerSignupDomains(env: EnvVars = process.env): string[] {
  return (env.COREEDGE_DEVELOPER_SIGNUP_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * May this address get a developer workspace on first sign-in?
 *
 * Never while the mode is off. When open: the developer domain list decides,
 * and an address the ordinary registration policy admits is admitted too —
 * that person would have got an account anyway, and with sign-up open the
 * account they get is this one.
 */
export function mayCreateDeveloperWorkspace(
  email: string,
  env: EnvVars = process.env,
): { allowed: boolean; reason?: string } {
  if (developerSignupMode(env) !== "open") {
    return { allowed: false, reason: "Developer sign-up is not open on this host." };
  }
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain) return { allowed: false, reason: "Invalid email format" };
  const domains = developerSignupDomains(env);
  if (domains.length === 0 || domains.includes(domain)) return { allowed: true };
  if (canRegister(email).allowed) return { allowed: true };
  return { allowed: false, reason: "Developer sign-up is not open to this email domain." };
}

/** Where a developer lands after signing in. Discover is the first minute. */
export const DEVELOPER_HOME = "/studio/discover";

/**
 * Paths a sandbox developer can actually use. A sign-in that was headed
 * anywhere else (the Workbench sign-in sends people to /presales, the portal
 * to /assessments) would land them on a refusal, so the bridge sends them to
 * Discover instead.
 */
const DEVELOPER_PATHS = ["/studio", "/coreedge", "/help", "/settings/security", "/invitations/", "/verify-mfa"];

export function developerLandingPath(target: string): string {
  const path = target.split(/[?#]/)[0] ?? "";
  const usable = DEVELOPER_PATHS.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));
  return usable ? target : DEVELOPER_HOME;
}

/** The workspace's name: the person's, which they can change later. */
export function workspaceNameFor(name: string): string {
  return `${name}'s workspace`.slice(0, 200);
}

/**
 * Create the account AND its workspace, in one transaction.
 *
 * Called only from the NextAuth adapter's `createUser`, which NextAuth calls
 * once the address has been proven by a clicked link, so `emailVerified` is
 * always set; a caller that has none is refused rather than trusted.
 */
export async function createDeveloperWorkspaceUser(data: {
  email: string;
  emailVerified: Date | null;
  name?: string | null;
  image?: string | null;
}): Promise<User> {
  if (!data.emailVerified) {
    throw new Error("A developer workspace needs a verified email address.");
  }
  const email = data.email.trim().toLowerCase();
  const name = data.name || email.split("@")[0] || "Developer";
  const workspaceName = workspaceNameFor(name);
  const slug = await uniqueOrganizationSlug(`${name}-workspace`);

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: workspaceName,
        slug,
        // A workspace is its developer's own tenant, so it is a client
        // organization in the canonical vocabulary (lib/utils/org-type.ts);
        // the role, not a new org type, is what makes it a developer's.
        type: "client",
        orgType: "client",
        contactEmail: email,
      },
      select: { id: true },
    });
    return tx.user.create({
      data: {
        email,
        emailVerified: data.emailVerified,
        name,
        image: data.image ?? null,
        role: "sandbox_developer",
        organizationId: org.id,
      },
    });
  });
}

export type SignupEmailLimit =
  | { readonly allowed: true }
  /**
   * `outage`: the limiter could not be asked (audit A44) — nobody was over
   * anything, and the caller says so (503), never "too many".
   */
  | { readonly allowed: false; readonly outage: boolean; readonly result: RateLimitResult };

/**
 * Spend one sign-up attempt for this address (P0.13 abuse control).
 *
 * Keyed by a hash so the limiter's store never holds the address itself.
 * Fails closed in production like every other bucket: during a limiter outage
 * nobody new signs up, which is the safe direction for a sign-up.
 */
export async function checkSignupEmailLimit(email: string): Promise<SignupEmailLimit> {
  const digest = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  const result = await checkRateLimit(`signup-email:${digest}`, RATE_LIMITS.signupPerEmail);
  if (result.allowed) return { allowed: true };
  return { allowed: false, outage: isLimiterOutage(result), result };
}
