/**
 * SAP API Policy §1.2, and the sign-off CoreEdge records for a customer-built
 * service on SAP S/4HANA Cloud Public Edition (roadmap P1.2, decision D2).
 *
 * THE POLICY (SAP API Policy v.4.2026a, §1.2): customer and third-party
 * applications must not call APIs that are not Published APIs, "except as
 * permitted by the Documentation or otherwise authorized by SAP (e.g.,
 * customers may use custom-developed ABAP interfaces in private cloud and
 * on-premise deployments)". The example names private cloud and on-premise.
 * A customer's own service on PUBLIC cloud (YY1_*, Z*) is not named, so the
 * roadmap asks for a RECORDED sign-off: a named person in the customer's
 * organisation states that the service's use is permitted by SAP's
 * documentation or authorised by SAP, and gives the basis.
 *
 * WHERE IT LIVES: on the interface (Interface.apiPolicySignOff), beside the
 * grant identity it covers (`custom:<path>`), written in the same transaction
 * as its POLICY_SIGN_OFF ConfigAudit row (api/studio/interfaces/[id]/
 * policy-sign-off). The broker reads it in the interface statement it already
 * sends, so a check costs no statement.
 *
 * WHAT IT GATES, by COREEDGE_API_POLICY_SIGNOFF:
 *   off       nothing;
 *   observe   (the default) nothing is refused; the broker logs a call and a
 *             grant decision records `policySignOffMissing` where a sign-off is
 *             needed and absent;
 *   enforce   a grant decision that would authorise such an interface is
 *             refused, and the broker answers 403 API_POLICY_SIGN_OFF_REQUIRED.
 * docs/runbooks/coreedge-api-policy.md is the switch's runbook.
 *
 * PURE AND CLIENT-SAFE: the broker's authorisation predicate (authorisation.ts)
 * and the Studio screens read the same rule.
 */

import { z } from "zod";

import { customerBuilt } from "@/lib/sap-public/tenant-discovery";

/** The policy and section a sign-off is given under. A new policy version needs a new sign-off. */
export const API_POLICY_ID = "SAP API Policy v.4.2026a §1.2";

/** §1.2 as SAP words it, quoted with its version wherever a person is asked to sign. */
export const API_POLICY_SECTION_TEXT =
  "Customer and third-party applications must not access, invoke, or interact in any manner with APIs that are not Published APIs … " +
  "except as permitted by the Documentation or otherwise authorized by SAP (e.g., customers may use custom-developed ABAP interfaces " +
  "in private cloud and on-premise deployments). … Customers and partners are required to verify that each endpoint for Documented Use is a Published API.";

/** The product whose customer-built services the sign-off covers: S/4HANA Cloud Public Edition. */
export const SIGN_OFF_PRODUCT = "s4hana";

export const SIGN_OFF_BASES = ["DOCUMENTATION", "SAP_AUTHORIZATION", "OTHER"] as const;
export type SignOffBasis = (typeof SIGN_OFF_BASES)[number];

export const SIGN_OFF_BASIS_LABELS: Readonly<Record<SignOffBasis, string>> = {
  DOCUMENTATION: "Permitted by SAP documentation for this product",
  SAP_AUTHORIZATION: "Authorised by SAP",
  OTHER: "Other",
};

export const MAX_SIGN_OFF_REFERENCE = 500;

/** What a person sends to sign: the basis, a reference (required unless the basis is SAP's documentation), and the acknowledgement. */
export const signOffInputSchema = z
  .object({
    basis: z.enum(SIGN_OFF_BASES),
    reference: z.string().trim().max(MAX_SIGN_OFF_REFERENCE).default(""),
    acknowledge: z.literal(true),
  })
  .refine((v) => v.basis === "DOCUMENTATION" || v.reference.length > 0, {
    message: "Give the reference for this basis: the ticket, the agreement or the page SAP's authorisation is in.",
    path: ["reference"],
  });

export type SignOffInput = z.infer<typeof signOffInputSchema>;

/** The stored sign-off. */
export interface ApiPolicySignOff {
  readonly policy: string;
  /** The interface's externalId when it was signed: a new service identity needs a new sign-off. */
  readonly serviceIdentity: string;
  readonly basis: SignOffBasis;
  readonly reference: string;
  /** sha256 (hex) of the statement the person acknowledged (statementText). */
  readonly statementHash: string;
  readonly signedById: string;
  readonly signedAt: string;
}

const STORED = z.object({
  policy: z.string(),
  serviceIdentity: z.string(),
  basis: z.enum(SIGN_OFF_BASES),
  reference: z.string().max(MAX_SIGN_OFF_REFERENCE),
  statementHash: z.string().regex(/^[0-9a-f]{64}$/),
  signedById: z.string(),
  signedAt: z.string(),
});

/** The statement a person acknowledges by signing, for this service. Its hash is stored with the sign-off. */
export function statementText(serviceIdentity: string): string {
  return (
    `I confirm that calling ${serviceIdentity} from applications through CoreEdge is permitted by SAP's documentation for this ` +
    `product or has been authorised by SAP, as SAP API Policy requires (${API_POLICY_ID}: "${API_POLICY_SECTION_TEXT}"), ` +
    "and that the basis I give is true."
  );
}

export type ApiPolicySignOffMode = "off" | "observe" | "enforce";

/** COREEDGE_API_POLICY_SIGNOFF: off | observe | enforce; anything else is observe, the default. */
export function apiPolicySignOffMode(): ApiPolicySignOffMode {
  const raw = (typeof process !== "undefined" ? process.env.COREEDGE_API_POLICY_SIGNOFF : undefined)?.trim().toLowerCase();
  return raw === "off" || raw === "enforce" ? raw : "observe";
}

/** The interface fields the rule reads. */
export interface PolicyInterface {
  readonly sapProduct: string;
  readonly externalId: string;
  readonly servicePath?: string | null;
  /** Interface.apiPolicySignOff as stored; undefined when the row was read without it. */
  readonly apiPolicySignOff?: unknown;
}

/**
 * Does this interface need a §1.2 sign-off? On S/4HANA Cloud Public Edition,
 * a service that is the customer's own: registered by its own path, or named
 * by a customer-built technical name (Z*, Y*, YY1_*).
 */
export function policySignOffRequired(iface: Pick<PolicyInterface, "sapProduct" | "externalId" | "servicePath">): boolean {
  if (iface.sapProduct !== SIGN_OFF_PRODUCT) return false;
  if (iface.servicePath != null && iface.servicePath !== "") return true;
  return customerBuilt(iface.externalId) !== null;
}

/** The interface's sign-off, when one is stored, is of this policy, and covers its service as it is now. */
export function currentSignOff(iface: Pick<PolicyInterface, "externalId" | "apiPolicySignOff">): ApiPolicySignOff | null {
  const parsed = STORED.safeParse(iface.apiPolicySignOff);
  if (!parsed.success) return null;
  if (parsed.data.policy !== API_POLICY_ID || parsed.data.serviceIdentity !== iface.externalId) return null;
  return parsed.data;
}

/** Needed, and not given. */
export function policySignOffMissing(iface: PolicyInterface): boolean {
  return policySignOffRequired(iface) && currentSignOff(iface) === null;
}

/** What the broker and a grant decision answer in enforce mode. */
export const SIGN_OFF_REQUIRED_MESSAGE =
  "This interface calls a customer-built service on SAP S/4HANA Cloud Public Edition, and nobody has recorded the SAP API Policy §1.2 sign-off for it. A builder records it on the interface in Studio.";
