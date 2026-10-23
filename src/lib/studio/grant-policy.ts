/**
 * The SAP API Policy §1.2 sign-off at a grant decision (roadmap P1.2,
 * api-policy.ts): every route that decides a grant asks this, so none of them
 * is a way round the switch.
 *
 * A decision that would authorise calls (anything but REJECTED) on an
 * interface that needs a sign-off and has none is refused under
 * COREEDGE_API_POLICY_SIGNOFF=enforce, and allowed with
 * `policySignOffMissing: true` for its audit row under observe (the default).
 * One statement, in the decision's own transaction, and only for a granting
 * decision on a bound interface.
 */

import type { Prisma } from "@prisma/client";

import { apiPolicySignOffMode, policySignOffMissing, SIGN_OFF_REQUIRED_MESSAGE } from "@/lib/studio/api-policy";

export type GrantPolicyCheck = { readonly ok: true; readonly policySignOffMissing: boolean } | { readonly ok: false; readonly message: string };

export async function grantPolicyCheck(
  db: Pick<Prisma.TransactionClient, "interface">,
  input: { readonly organizationId: string; readonly interfaceId: string | null; readonly decision: string },
): Promise<GrantPolicyCheck> {
  const mode = apiPolicySignOffMode();
  if (mode === "off" || input.decision === "REJECTED" || input.interfaceId === null) return { ok: true, policySignOffMissing: false };
  const iface = await db.interface.findFirst({
    where: { id: input.interfaceId, organizationId: input.organizationId },
    select: { sapProduct: true, externalId: true, servicePath: true, apiPolicySignOff: true },
  });
  if (!iface || !policySignOffMissing(iface)) return { ok: true, policySignOffMissing: false };
  if (mode === "enforce") return { ok: false, message: `${SIGN_OFF_REQUIRED_MESSAGE} Record it, then decide this request.` };
  return { ok: true, policySignOffMissing: true };
}
