/**
 * Is a read interface's DEFINITION complete enough for the broker to call?
 *
 * The data route answers 400 VALIDATION_ERROR for an interface whose service
 * cannot be resolved or which names no entity set — after the grant gate and
 * the connection binding have passed. The Test Console's dry run refuses the
 * same two, and discovery's `callable` has to agree with both (audit A42: it
 * said `callable: true` for exactly these feeds, so the advisory built to
 * prevent a surprising failure promised a call that 400s every time).
 *
 * One function, so the three cannot drift. Server-only: resolving a catalogue
 * service may read the catalogue (resolve-hub-service.ts).
 */

import {
  hasCustomService,
  resolveInterfaceService,
  type InterfaceServiceFields,
} from "@/lib/sap-public/interface-service";
import type { SapOdataProduct, SapServiceDefinition } from "@/lib/sap-public/tdd-connector";

export type ReadDefinitionRefusal =
  /** The interface's own service path no longer validates for its product. */
  | "SERVICE_PATH_INVALID"
  /** A catalogue interface whose service the catalogue does not resolve. */
  | "SERVICE_UNRESOLVED"
  /** The service resolves, but the interface names no dataset. */
  | "NO_ENTITY_SET";

export type ReadDefinition =
  | { ok: true; service: SapServiceDefinition; entitySet: string }
  | { ok: false; reason: ReadDefinitionRefusal };

/**
 * The service and dataset the broker would read, or why it would refuse. The
 * service is judged first, as the data route's message always has: a feed with
 * neither a resolvable service nor a dataset is told about the service.
 */
export async function resolveReadDefinition(
  product: SapOdataProduct,
  iface: InterfaceServiceFields & { entitySet: string | null },
): Promise<ReadDefinition> {
  const resolved = await resolveInterfaceService(product, iface);
  if (!resolved) {
    return { ok: false, reason: hasCustomService(iface) ? "SERVICE_PATH_INVALID" : "SERVICE_UNRESOLVED" };
  }
  // An empty string names no dataset any more than null does.
  if (!iface.entitySet) return { ok: false, reason: "NO_ENTITY_SET" };
  return { ok: true, service: resolved.service, entitySet: iface.entitySet };
}
