/**
 * The binding's I/O: an organisation's connections for one product, as
 * authorisation.ts `bindingFor` judges them (P0.2).
 *
 * The northbound routes, the lane board and the lane sweep each ask
 * `bindingFor` of the same estate, so the board names the connection a call
 * would go through — on the interface's product and the credential's SAP
 * client — and the sweep reads through that same connection.
 */

import type { BindingDecision, BindingEstate, BrokerRoute } from "@/lib/northbound/authorisation";
import {
  resolveSapConnectionForEnvironment,
  resolveSapConnections,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";

/**
 * The active connections an organisation has for a product, opened.
 *
 * Opened, not merely listed, because that is what the broker does on every
 * call: one row whose secret will not open — sealed under a previous
 * SAP_CONNECTION_ENCRYPTION_KEY, or an auth type outside the vocabulary —
 * refuses every call for the product as CONNECTION_UNREADABLE, and a preview
 * that never tried would call those lanes live. The secrets stay in this
 * process and are never returned to a screen.
 */
export async function loadBindingEstate(
  organizationId: string,
  product: string,
): Promise<BindingEstate<ResolvedSapConnection>> {
  if (getSapProduct(product) === null) return { kind: "unknownProduct" };
  try {
    return { kind: "connections", connections: await resolveSapConnections(organizationId, product) };
  } catch {
    // Fail closed on the whole set, exactly as resolveSapConnectionForEnvironment
    // does: skipping only the bad row could bind to a connection the estate
    // never meant.
    return { kind: "unreadable" };
  }
}

/**
 * The broker's binding for one call: `bindingFor` on the product's estate
 * (through `resolveSapConnectionForEnvironment`, which is exactly that for a
 * known product).
 */
export async function resolveBindingFor(
  organizationId: string,
  product: string,
  environment: string,
  route: BrokerRoute,
  sapClient: string | null | undefined,
): Promise<BindingDecision<ResolvedSapConnection>> {
  if (getSapProduct(product) === null) return { ok: false, reason: "UNKNOWN_PRODUCT" };
  return resolveSapConnectionForEnvironment(
    organizationId,
    product,
    environment,
    route === "write" ? "WRITE" : "READ",
    sapClient,
  );
}
