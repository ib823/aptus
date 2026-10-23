/**
 * How many write keys a caller could present now — the count Operations >
 * Tokens and Control Tower's credential register both show (P0.3, A62).
 *
 * A write key travels with its credential's bearer token, so it is usable
 * exactly when authentication accepts that token. Authentication refuses it
 * on two hops, and the count applies both:
 *
 *   - the key hop (`liveKeyWhere`): active, not revoked, not expired;
 *   - the app hop (authorisation.ts `solutionRefusal`): the credential's app
 *     is not RETIRED. Retiring an app does not revoke its credentials, so a
 *     retired app's unexpired credential still holds its sealed write key —
 *     and every call with it is refused SOLUTION_RETIRED (review round 4).
 *     Counted, it read as a write path that can never be used.
 *
 * SOLUTION_MISSING, authentication's other app refusal, needs no filter here:
 * nothing deletes a solution, so a credential's app is always found.
 *
 * Counted, never selected: `secretsCiphertext` holds the write key, so the
 * count answers "does one exist" without loading a value into memory.
 */

import { prisma } from "@/lib/db/prisma";
import { liveKeyWhere } from "@/lib/northbound/key-policy";
import { opsWhere, type OpsActor } from "@/lib/ops/guard";

export async function countPresentableWriteKeys(actor: OpsActor, now: Date): Promise<number> {
  // Scoped like the count itself: a retired app in another tenant is not this caller's to see.
  const retired = await prisma.solution.findMany({
    where: opsWhere(actor, { status: "RETIRED" as const }),
    select: { id: true },
  });
  return prisma.solutionClient.count({
    where: opsWhere(actor, {
      ...liveKeyWhere(now),
      secretsCiphertext: { not: null },
      ...(retired.length > 0 ? { solutionId: { notIn: retired.map((s) => s.id) } } : {}),
    }),
  });
}
