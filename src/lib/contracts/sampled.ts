/**
 * A contract from sampled rows: the fallback when a service's description
 * could not be read (schema-capture.ts observed what a live read returned).
 *
 * It claims only what the sample showed: property names, the JSON type seen
 * (as `x-json:<type>`, or `x-json:` when the rows disagreed), and whether a
 * null was seen. It has no key, no facets and no capabilities, because rows do
 * not carry them — and the JSON Schemas built from it say so.
 */

import {
  CONTRACT_IR_VERSION,
  SAMPLED_TYPE_PREFIX,
  type InterfaceContract,
  type IrProperty,
  type ODataVersion,
} from "@/lib/contracts/ir";
import type { CapturedSchema } from "@/lib/studio/schema-capture";

export function contractFromSample(
  schema: Pick<CapturedSchema, "properties">,
  entitySet: string,
  odataVersion: ODataVersion,
): InterfaceContract {
  const properties: IrProperty[] = Object.entries(schema.properties).map(([name, p]) => ({
    name,
    type: `${SAMPLED_TYPE_PREFIX}${p.type ?? ""}`,
    nullable: p.nullable === true,
  }));
  return {
    irVersion: CONTRACT_IR_VERSION,
    odataVersion,
    source: "SAMPLED",
    entitySet: { name: entitySet, entityType: `sampled.${entitySet}`, capabilities: {} },
    entityType: { name: entitySet, qualifiedName: `sampled.${entitySet}`, key: [], properties, navigations: [] },
    complexTypes: [],
    enumTypes: [],
    operations: [],
  };
}
