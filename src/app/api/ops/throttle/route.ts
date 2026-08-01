/**
 * GET /api/ops/throttle — how much of each rate-limit budget is left.
 *
 * THIS ENDPOINT READS THE BUDGET WITHOUT SPENDING IT. The obvious way to build
 * a throttle gauge is `checkRateLimit`, and it would be wrong: that function
 * CONSUMES a token. A dashboard polling it would eat the budget it displays,
 * and on the northbound bucket — 60 per minute, per credential — a console left
 * open would manufacture the 429s it exists to warn about. `peekRateLimit` uses
 * Upstash's `getRemaining` and, on the in-memory path, counts the window without
 * pushing to it.
 *
 * TWO KINDS OF BUCKET, AND THEY ARE NOT INTERCHANGEABLE.
 *
 *   PER CREDENTIAL — `northbound:{clientId}` and `northbound-write:{clientId}`.
 *   Keyed by the client token, so a runaway or leaked credential throttles only
 *   itself. These are observable: we know every credential in the tenant, so we
 *   can ask for each one's headroom, and a 429 on these paths reaches the route
 *   and is written to the audit trail.
 *
 *   PER CLIENT IP — the middleware's `api:{METHOD}:{ip}` buckets. These fire
 *   BEFORE the route runs, so nothing is persisted and no audit row exists. They
 *   are also keyed by an address we cannot enumerate. So they are reported as
 *   CONFIGURATION ONLY, with `observable: false` — never as a per-tenant figure.
 *   Calling an IP-keyed limit "this customer's throttle" would be a fabrication,
 *   and a particularly convincing one.
 *
 * WHAT A NULL MEANS. `peekRateLimit` returns null when the shared backend is
 * unreachable. That is rendered as unknown, never as zero: zero would read as
 * "this credential is throttled right now", which is a claim about a customer's
 * traffic that we would be making up during our own outage.
 */

import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { opsWhere, opsWindowHours, requireOperations } from "@/lib/ops/guard";
import { THROTTLE_BUCKETS } from "@/lib/ops/throttle";
import { peekRateLimit, rateLimitBackend, RATE_LIMITS } from "@/lib/security/rate-limit";
import { studioOk } from "@/lib/studio/api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireOperations();
  if (!guard.ok) return guard.response;

  const hours = opsWindowHours(request.nextUrl.searchParams.get("hours"));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Only live credentials: a revoked one has no budget worth reporting, and
  // listing it would imply it could still be called.
  const credentials = await prisma.solutionClient.findMany({
    where: opsWhere(guard.actor, { isActive: true, revokedAt: null }),
    select: {
      id: true,
      solutionId: true,
      label: true,
      environment: true,
    },
    orderBy: { createdAt: "desc" },
  });

  /*
   * Solution names, resolved separately.
   *
   * SolutionClient carries `solutionId` but has no Prisma relation to Solution,
   * so this cannot be an include. Resolved so this screen names a credential
   * the same way the Control Tower Credential Register does — one credential
   * appearing under two different names across two screens is impossible to
   * cross-reference during an incident, which is exactly when you need to.
   */
  const solutionNames = new Map(
    (
      await prisma.solution.findMany({
        where: opsWhere(guard.actor, {
          id: { in: [...new Set(credentials.map((c) => c.solutionId))] },
        }),
        select: { id: true, name: true },
      })
    ).map((sn) => [sn.id, sn.name]),
  );

  const [throttled429, headroom] = await Promise.all([
    prisma.northboundAuditEvent.groupBy({
      by: ["clientTokenId", "operation"],
      where: opsWhere(guard.actor, { status: 429, at: { gte: since } }),
      _count: { _all: true },
    }),
    Promise.all(
      credentials.map(async (c) => ({
        clientId: c.id,
        read: await peekRateLimit(`northbound:${c.id}`, RATE_LIMITS.northbound),
        write: await peekRateLimit(`northbound-write:${c.id}`, RATE_LIMITS.northbound),
      })),
    ),
  ]);

  const headroomById = new Map(headroom.map((h) => [h.clientId, h]));
  const throttledById = new Map<string, number>();
  for (const g of throttled429) {
    throttledById.set(g.clientTokenId, (throttledById.get(g.clientTokenId) ?? 0) + g._count._all);
  }

  /** null remaining → unknown. Never rendered as a number. */
  function budget(peek: { remaining: number; limit: number } | null) {
    if (peek === null) {
      return { known: false as const, remaining: null, limit: RATE_LIMITS.northbound.limit };
    }
    return { known: true as const, remaining: peek.remaining, limit: peek.limit };
  }

  const anyUnknown = headroom.some((h) => h.read === null || h.write === null);
  const backend = rateLimitBackend();

  return studioOk({
    windowHours: hours,
    since: since.toISOString(),
    scope: guard.actor.kind,
    buckets: THROTTLE_BUCKETS.map((b) => ({
      id: b.id,
      key: b.key,
      keyedBy: b.keyedBy,
      limit: b.config.limit,
      windowMs: b.config.windowMs,
      observable: b.observable,
      note: b.note,
    })),
    credentials: credentials.map((c) => {
      const h = headroomById.get(c.id);
      return {
        clientId: c.id,
        solutionId: c.solutionId,
        solutionName: solutionNames.get(c.solutionId) ?? null,
        label: c.label,
        environment: c.environment,
        read: budget(h?.read ?? null),
        write: budget(h?.write ?? null),
        /** Real 429s on this credential in the window, from the audit trail. */
        throttledInWindow: throttledById.get(c.id) ?? 0,
      };
    }),
    provenance: {
      nonConsumingRead: true,
      why: "Headroom is read with getRemaining, which does not spend a token. A gauge built on the consuming check would eat the budget it displays and could create the 429s it warns about.",
      edgeBucketsAreNotObservable:
        "The two IP-keyed middleware buckets fire before the route and persist nothing, and their key is an address we cannot enumerate. Their limits are reported as configuration; no per-tenant usage figure for them exists or can be inferred.",
      unknownRatherThanZero: anyUnknown
        ? "The shared rate-limit backend did not answer for at least one credential. Those are reported as unknown, not as zero — a zero would read as 'throttled right now'."
        : null,
      /**
       * WHICH BACKEND, ASKED RATHER THAN ASSUMED.
       *
       * This used to print the in-memory caveat unconditionally. That is wrong
       * in both directions — on a deployment with Upstash it tells an operator
       * their headroom is per-instance when it is deployment-wide, and on one
       * without it buries a real warning among routine notes. Hedging about
       * data you can actually check is the same failure as over-claiming about
       * data you cannot.
       */
      backend,
      headroomIsPerInstance: backend === "in-memory",
      backendNote:
        backend === "shared"
          ? "Limits are enforced against a shared backend, so headroom is deployment-wide and the figures below are the real remaining budget."
          : "NO SHARED RATE-LIMIT BACKEND IS CONFIGURED. Each serverless instance keeps its own counter, so the effective limit is the configured one multiplied by however many instances are warm — a number nobody can see. Headroom below reflects one instance. In production this is a configuration fault, not a display caveat.",
      throttleCountsAreAFloor:
        "throttledInWindow counts audited 429s only. A call refused by an edge bucket never reached the broker and is not in this number.",
    },
  });
}
