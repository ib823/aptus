/**
 * Would the broker serve a read of this interface, to this credential, now?
 *
 * DISCOVERY'S `callable`, DECIDED BY THE DATA ROUTE'S OWN STEPS (P0.4, A42).
 * `GET /api/northbound/interfaces` says per interface whether a call would be
 * served, so a developer learns why before making it. It used to keep its own
 * copy of the grant rules and nothing else, and advertised as callable feeds
 * the data route refuses on every call: no entity set, a catalogue service
 * that does not resolve, no connection the credential could bind to. An
 * advisory that contradicts the enforcement is worse than none.
 *
 * So the verdict runs the data route's chain, in its order, with its functions:
 *
 *   1. the grant gate                  decideReadAccess (access.ts) — the
 *      read path's own decision, P0.1's grant binding included;
 *   2. the connection binding          bindingFor (authorisation.ts), the
 *      function resolveSapConnectionForEnvironment applies, on the
 *      organization's active rows for the product, with the credential's
 *      environment and SAP client;
 *   3. the definition                  resolveReadDefinition (read-definition.ts).
 *
 * The credential itself was judged before any of this — expired, retired,
 * revoked or out of its overlap window (P0.11) — by authenticateClientToken,
 * which both routes call first; a key it refuses gets 401 from both.
 *
 * WHAT THE VERDICT CANNOT SEE, and says so here rather than pretending:
 *   - CONNECTION_UNREADABLE. The binding is selected on connection METADATA;
 *     opening every connection's secrets to list interfaces would decrypt
 *     credentials for a metadata call. A stored row whose secrets no longer
 *     open is reported callable and the data route answers 403
 *     CONNECTION_NOT_CONFIGURED. The binding preview in Studio has the same
 *     boundary, for the same reason.
 *   - Anything the TENANT decides: the read itself may still answer 403, 404
 *     or fail. `callable` means the broker would make the call, not that SAP
 *     will answer it.
 *
 * COST. One connection query per product among the interfaces that pass the
 * grant gate, and one catalogue lookup per distinct non-curated service among
 * those that also bind. Nothing is looked up for an interface an earlier step
 * already refused, as in the data route.
 */

import {
  decideReadAccess,
  type AccessRefusal,
  type ReadDecisionGrant,
  type ReadableInterfaceRow,
} from "@/lib/northbound/access";
import { resolveReadDefinition, type ReadDefinitionRefusal } from "@/lib/northbound/read-definition";
import { transportRefusal, type TransportRefusal } from "@/lib/governed/transport";
import { bindingFor } from "@/lib/northbound/authorisation";
import { listBindableConnections, type ConnectionBindingFailure } from "@/lib/sap-public/connection-resolver";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";
import { grantBindingMode, grantFetchedFor } from "@/lib/studio/grant-binding";

/** Why the broker would refuse the read — the reason the data route would audit. */
export type ReadRefusal = AccessRefusal | ConnectionBindingFailure | TransportRefusal | ReadDefinitionRefusal;

export interface ReadVerdictInput {
  organizationId: string;
  solutionId: string;
  /** The credential's environment and SAP client, as the data route binds them. */
  environment: string;
  sapClient: string | null;
  interfaces: readonly ReadableInterfaceRow[];
  /** The solution's grants in this environment, each with its externalId. */
  grants: readonly (ReadDecisionGrant & { externalId: string; operation: string })[];
  now: Date;
}

/**
 * Per interface id: null when the broker would serve the read, else the reason
 * it would refuse.
 */
export async function readVerdicts(input: ReadVerdictInput): Promise<Map<string, ReadRefusal | null>> {
  const mode = grantBindingMode();
  const verdicts = new Map<string, ReadRefusal | null>();
  const bindings = new Map<string, Promise<ConnectionBindingFailure | TransportRefusal | null>>();
  const definitions = new Map<string, Promise<ReadDefinitionRefusal | null>>();
  const bindingOf = (product: string) => {
    let pending = bindings.get(product);
    if (!pending) {
      pending = listBindableConnections(input.organizationId, product).then((rows) => {
        // The broker's binding predicate (P0.2), on rows never opened, then
        // the bound connection's transport, as the binding step asks it
        // (wave 2 integration review round 3).
        const selection = bindingFor({ kind: "connections", connections: rows }, input.environment, "read", input.sapClient);
        return selection.ok ? transportRefusal(selection.connection) : selection.reason;
      });
      bindings.set(product, pending);
    }
    return pending;
  };

  for (const iface of input.interfaces) {
    // 1 — the grant gate, on the grants the data route would fetch for it.
    const access = decideReadAccess(
      iface,
      input.solutionId,
      input.environment,
      input.grants.filter((g) => grantFetchedFor(g, iface)),
      input.now,
      mode,
    );
    if (!access.ok) {
      verdicts.set(iface.id, access.reason);
      continue;
    }
    // 2 — the binding. An unknown product is the data route's own reason too.
    const product = getSapProduct(iface.sapProduct);
    if (!product) {
      verdicts.set(iface.id, "UNKNOWN_PRODUCT");
      continue;
    }
    const binding = await bindingOf(iface.sapProduct);
    if (binding) {
      verdicts.set(iface.id, binding);
      continue;
    }
    // 3 — the definition: service, then dataset. Several interfaces of one
    // service share its catalogue lookup.
    const key = JSON.stringify([iface.sapProduct, iface.externalId, iface.servicePath ?? null, iface.odataVersion ?? null, iface.entitySet]);
    let definition = definitions.get(key);
    if (!definition) {
      definition = resolveReadDefinition(product, iface).then((d) => (d.ok ? null : d.reason));
      definitions.set(key, definition);
    }
    verdicts.set(iface.id, await definition);
  }
  return verdicts;
}
