/**
 * What registering an interface accepts, and which service it names: the one
 * rule POST /api/studio/interfaces and the description upload
 * (POST /api/studio/interfaces/from-description, roadmap P1.2) both apply,
 * extracted so the two cannot drift. A catalogue service is named by its
 * apiId; the customer's own by its service path and OData version, with its
 * `custom:` id DERIVED (service-path.ts), never typed.
 */

import { z } from "zod";

import { productAcceptsServicePath } from "@/lib/sap-public/interface-service";
import {
  customExternalId,
  isCustomExternalId,
  MAX_SERVICE_PATH_LENGTH,
  ODATA_VERSIONS,
  validateServicePath,
  type ODataVersion,
} from "@/lib/sap-public/service-path";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";

export const interfaceBodySchema = z.object({
  solutionId: z.string().min(1),
  /**
   * Catalogue apiId of the service being consumed. Omitted for your own API:
   * there it is derived from `servicePath` (see the header).
   */
  externalId: z.string().min(1).max(200).optional(),
  /**
   * The customer's OWN service root, a path on the connection's host. Bounded
   * one past the limit here so an over-long path reaches validateServicePath
   * and gets its own sentence rather than the generic payload refusal.
   */
  servicePath: z.string().max(MAX_SERVICE_PATH_LENGTH + 1).optional(),
  odataVersion: z.enum(ODATA_VERSIONS).optional(),
  /*
   * EVERY PRODUCT THE CONNECTOR KNOWS, not a hand-kept three. The literal enum
   * ["s4hana","successfactors","ariba"] predated the private-cloud/on-prem/ECC
   * products and was never widened — so the three client-addressing products
   * could be CONNECTED but no interface (and therefore no grant, credential,
   * scaffold or broker call) could ever be defined against them: "Add to
   * interface" on a RISE tenant 400'd with no field-level detail. Validated
   * against getSapProduct so this list and the product registry cannot drift
   * apart again.
   */
  sapProduct: z.string().min(1).refine((k) => getSapProduct(k) !== null, {
    message: "Unknown SAP product",
  }),
  name: z.string().min(1).max(200),
  operation: z.enum(["READ", "CREATE", "UPDATE"]).default("READ"),
  entitySet: z.string().max(200).optional(),
});

export type InterfaceBody = z.infer<typeof interfaceBodySchema>;

export type ServiceChoice =
  | { ok: true; externalId: string; servicePath: string | null; odataVersion: ODataVersion | null }
  | { ok: false; message: string };

/**
 * CATALOGUE OR YOUR OWN API — decided before anything is looked up. With a
 * service path the id is derived and the version is required; without one
 * the request is a catalogue request, and the derived prefix is reserved so a
 * catalogue interface can never pose as a custom one.
 */
export function chooseService(input: InterfaceBody): ServiceChoice {
  if (input.servicePath !== undefined) {
    if (!productAcceptsServicePath(input.sapProduct)) {
      const label = getSapProduct(input.sapProduct)?.label ?? input.sapProduct;
      return { ok: false, message: `${label} is not an OData product, so it has no service path.` };
    }
    const check = validateServicePath(input.servicePath);
    if (!check.ok) return { ok: false, message: check.message };
    if (input.odataVersion === undefined) {
      return { ok: false, message: "Choose the OData version of this service (V2 or V4)." };
    }
    const derived = customExternalId(check.path);
    if (input.externalId !== undefined && input.externalId !== derived) {
      return { ok: false, message: "For your own API the id is derived from the service path, so leave externalId out." };
    }
    return { ok: true, externalId: derived, servicePath: check.path, odataVersion: input.odataVersion };
  }
  if (input.odataVersion !== undefined) {
    return {
      ok: false,
      message:
        "An OData version belongs to your own service path. Send servicePath with it, or leave both out for a catalogue service.",
    };
  }
  if (input.externalId === undefined) return { ok: false, message: "Invalid interface payload." };
  if (isCustomExternalId(input.externalId)) {
    return {
      ok: false,
      message: "Ids starting with custom: are reserved for your own APIs. Send servicePath and odataVersion instead.",
    };
  }
  return { ok: true, externalId: input.externalId, servicePath: null, odataVersion: null };
}
