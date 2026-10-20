/**
 * Claiming the first platform admin of a fresh instance (roadmap P0.13).
 *
 * THE GAP THIS CLOSES. The sign-in adapter made the very first account on an
 * empty database `platform_admin`. On a fresh instance — a new self-host, a
 * restored staging copy, a preview with its own database — whoever reached the
 * sign-in page first owned it, and with sign-up open that is a race any
 * stranger could enter. Now no account becomes platform admin by arriving
 * first (lib/auth/auth-options.ts). The first one is CLAIMED, by a signed-in
 * person who presents the token the operator configured:
 *
 *   COREEDGE_BOOTSTRAP_TOKEN — at least 32 characters, chosen by whoever
 *   deploys the instance and given only to the person who should administer
 *   it. Unset (the default) or shorter, nobody can claim anything.
 *
 * THE RULES, each enforced here:
 *   · only while the instance has NO active platform admin. Production has
 *     one, so on production this route refuses whatever is presented and the
 *     token changes nothing;
 *   · constant-time: both sides are hashed to 32 bytes and compared with
 *     `timingSafeEqual`, so neither the token's content nor its length leaks
 *     through timing;
 *   · single use: the claim writes a PlatformGovernanceAudit row carrying the
 *     token's SHA-256, and a token whose hash is on such a row is refused
 *     forever after — even if every admin is later removed. Recovering an
 *     instance that has lost its admins takes a NEW token
 *     (docs/runbooks/developer-onboarding.md);
 *   · audited, refusals included: BOOTSTRAP_ADMIN for the claim and
 *     BOOTSTRAP_REFUSED for every refused attempt, on the platform trail;
 *   · serializable: two claims at once both read "no admin" and both try to
 *     write; Postgres aborts one, which is answered as a conflict, so at most
 *     one person is ever made admin by this path.
 *
 * The route (POST /api/auth/bootstrap-admin) adds the governance step-up
 * (`platform.bootstrap`) between the token check and the claim, so personal
 * and CI tokens can never claim, and an enforcing host wants a passkey too.
 */

import { createHash, timingSafeEqual } from "node:crypto";

import { Prisma } from "@prisma/client";

import { isAdminRoleName, LEGACY_ROLE_NAMES } from "@/lib/auth/role-migration";
import { prisma } from "@/lib/db/prisma";
import { writePlatformGovernanceAudit } from "@/lib/studio/audit";
import { ALL_USER_ROLES } from "@/types/assessment";

/** Shorter than this, a configured token is treated as no token at all. */
export const BOOTSTRAP_TOKEN_MIN_LENGTH = 32;

/** process.env, or any plain map of the same variables (tests pass one). */
type EnvVars = Readonly<Record<string, string | undefined>>;

/**
 * The stored role values that count as a platform admin, DERIVED from the one
 * rule (`isAdminRoleName`) rather than listed: a row may still hold the legacy
 * value, and a database query cannot call the function, so it is asked of
 * every value a row could hold.
 */
const ADMIN_ROLE_VALUES: readonly string[] = [...ALL_USER_ROLES, ...LEGACY_ROLE_NAMES].filter(isAdminRoleName);

export type BootstrapRefusal =
  /** No token configured, or one too short to be a secret. */
  | "NOT_CONFIGURED"
  /** The token presented is not the configured one. */
  | "INVALID_TOKEN"
  /** The instance already has an active platform admin. */
  | "ADMIN_EXISTS"
  /** This token already made someone admin once. */
  | "TOKEN_USED"
  /** Another claim committed first. */
  | "CONFLICT";

export const BOOTSTRAP_REFUSAL_MESSAGES: Record<BootstrapRefusal, string> = {
  NOT_CONFIGURED:
    "No bootstrap token is configured on this instance, so no administrator can be claimed. " +
    "The operator sets COREEDGE_BOOTSTRAP_TOKEN (32 characters or more).",
  INVALID_TOKEN: "That is not this instance's bootstrap token. Nothing has changed.",
  ADMIN_EXISTS:
    "This instance already has a platform administrator. Ask them for the access you need.",
  TOKEN_USED:
    "This bootstrap token has already been used. The operator must configure a new one.",
  CONFLICT: "Another claim was being made at the same moment. Reload and try again.",
};

/** The configured token, or null when none (or too short to be one) is set. */
export function configuredBootstrapToken(env: EnvVars = process.env): string | null {
  const token = env.COREEDGE_BOOTSTRAP_TOKEN?.trim() ?? "";
  return token.length >= BOOTSTRAP_TOKEN_MIN_LENGTH ? token : null;
}

/** SHA-256 hex of a token: what the audit row keeps instead of the token. */
export function bootstrapTokenDigest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Constant-time comparison. Hashing first gives both sides 32 bytes, so
 * `timingSafeEqual` never throws on a length mismatch and the length of the
 * real token is never what an early return reveals.
 */
export function bootstrapTokenMatches(presented: string, configured: string): boolean {
  const a = createHash("sha256").update(presented.trim(), "utf8").digest();
  const b = createHash("sha256").update(configured, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Is there an active platform admin? */
export async function hasActivePlatformAdmin(): Promise<boolean> {
  const count = await prisma.user.count({
    where: { role: { in: [...ADMIN_ROLE_VALUES] }, isActive: true },
  });
  return count > 0;
}

/** What the claim screen should offer: a form, or why there is none. */
export async function bootstrapAvailability(): Promise<{ open: true } | { open: false; refusal: BootstrapRefusal }> {
  if (!configuredBootstrapToken()) return { open: false, refusal: "NOT_CONFIGURED" };
  if (await hasActivePlatformAdmin()) return { open: false, refusal: "ADMIN_EXISTS" };
  return { open: true };
}

/**
 * The checks that need no write: a token configured, and this one presented.
 * The route runs these before the step-up, so nobody is asked for a passkey
 * to be told the token was wrong.
 */
export function checkBootstrapToken(presented: string): { ok: true } | { ok: false; refusal: BootstrapRefusal } {
  const configured = configuredBootstrapToken();
  if (!configured) return { ok: false, refusal: "NOT_CONFIGURED" };
  if (!bootstrapTokenMatches(presented, configured)) return { ok: false, refusal: "INVALID_TOKEN" };
  return { ok: true };
}

interface Claimant {
  readonly id: string;
  readonly email: string;
}

/** Best-effort, like every governance audit row: a refusal is refused regardless. */
export async function recordBootstrapRefusal(user: Claimant, refusal: BootstrapRefusal): Promise<void> {
  await writePlatformGovernanceAudit({
    actorId: user.id,
    entityType: "User",
    entityId: user.id,
    action: "BOOTSTRAP_REFUSED",
    after: { event: "bootstrap_refused", refusal },
  });
}

class Refused extends Error {
  constructor(readonly refusal: BootstrapRefusal) {
    super(refusal);
  }
}

/**
 * Make this person the instance's first platform admin, or say why not.
 *
 * Re-checks the token itself rather than trusting the caller to have done so,
 * and records the claim INSIDE the transaction: unlike the best-effort audit
 * rows, this one is the single-use marker, so a claim that cannot record
 * itself must not happen.
 */
export async function claimPlatformAdmin(
  user: Claimant,
  presented: string,
): Promise<{ ok: true } | { ok: false; refusal: BootstrapRefusal }> {
  const check = checkBootstrapToken(presented);
  if (!check.ok) {
    await recordBootstrapRefusal(user, check.refusal);
    return check;
  }
  const digest = bootstrapTokenDigest(presented.trim());

  try {
    await prisma.$transaction(
      async (tx) => {
        const admins = await tx.user.count({
          where: { role: { in: [...ADMIN_ROLE_VALUES] }, isActive: true },
        });
        if (admins > 0) throw new Refused("ADMIN_EXISTS");

        const used = await tx.platformGovernanceAudit.findFirst({
          where: { action: "BOOTSTRAP_ADMIN", after: { path: ["tokenSha256"], equals: digest } },
          select: { id: true },
        });
        if (used) throw new Refused("TOKEN_USED");

        const claimed = await tx.user.update({
          where: { id: user.id },
          data: { role: "platform_admin" },
          select: { id: true },
        });
        await tx.platformGovernanceAudit.create({
          data: {
            actorId: user.id,
            entityType: "User",
            entityId: claimed.id,
            action: "BOOTSTRAP_ADMIN",
            after: { event: "bootstrap_admin", email: user.email, tokenSha256: digest },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    const refusal: BootstrapRefusal | null =
      err instanceof Refused
        ? err.refusal
        : err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034"
          ? "CONFLICT"
          : null;
    if (refusal === null) throw err;
    await recordBootstrapRefusal(user, refusal);
    return { ok: false, refusal };
  }

  return { ok: true };
}
