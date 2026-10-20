/**
 * Does a captured schema or a recorded fixture belong to the interface's
 * CURRENT contract?
 *
 * THE DEFECT (audit A38). Changing an interface's entity set (or its operation,
 * or your own API's service) bumps its contract version — and left the
 * captured response schema and the mock fixtures alone. Neither recorded which
 * contract it came from, so the northbound /schema endpoint served the new
 * entity set and version with the OLD shape and `schemaCaptured: true`, the
 * starter kit typed the new entity set with the old fields "captured from N
 * live rows", and `npm run mock` served the old entity set's rows as the new
 * one's. A claim of observation, for a contract nobody had observed.
 *
 * TWO DEFENCES, either sufficient on its own:
 *   1. The Studio PATCH that changes the contract clears the schema and
 *      deletes the fixtures, in the same transaction as the version bump.
 *   2. Every capture is STAMPED with the version and entity set it was read
 *      under (x-captured.interfaceVersion / .entitySet on the schema; the
 *      interfaceVersion / entitySet columns on MockFixture), and every reader
 *      — /schema, the starter kit, Studio — asks this module, which treats an
 *      artifact as captured only when its stamp matches the interface now.
 *
 * A capture stamped for another contract is STALE and is never served. One
 * with no stamp predates stamping; the P0.4 migration stamped every one whose
 * contract could be established from the audit trail, so an unstamped one is
 * UNVERIFIED — its contract cannot be established — and is withheld too, with
 * a sentence saying why. Nothing is deleted on the way out: re-capturing
 * replaces it. docs/runbooks/coreedge-contract-hygiene.md lists them.
 */

import { isCapturedSchema, servedResponseSchema } from "@/lib/studio/schema-capture";

/** The interface's contract identity: what a capture must have been read under. */
export interface ContractIdentity {
  version: number;
  entitySet: string | null;
}

/** What a capture says about the contract it was read under. */
export interface ContractStamp {
  interfaceVersion?: number | null;
  entitySet?: string | null;
}

export type ArtifactState = "current" | "stale" | "unverified";

export function artifactState(stamp: ContractStamp, iface: ContractIdentity): ArtifactState {
  if (typeof stamp.interfaceVersion !== "number") return "unverified";
  return stamp.interfaceVersion === iface.version && (stamp.entitySet ?? null) === (iface.entitySet ?? null)
    ? "current"
    : "stale";
}

/** The stamp a stored schema carries in x-captured, or none. */
export function schemaStamp(schema: unknown): ContractStamp {
  if (!isCapturedSchema(schema)) return {};
  const captured = (schema as { "x-captured"?: ContractStamp })["x-captured"];
  if (!captured || typeof captured !== "object") return {};
  return {
    interfaceVersion: typeof captured.interfaceVersion === "number" ? captured.interfaceVersion : null,
    entitySet: typeof captured.entitySet === "string" ? captured.entitySet : null,
  };
}

export type SchemaState = ArtifactState | "none";

/** Where a stored response schema stands against the interface's contract. */
export function responseSchemaState(schema: unknown, iface: ContractIdentity): SchemaState {
  if (schema === null || schema === undefined) return "none";
  return artifactState(schemaStamp(schema), iface);
}

/**
 * The response schema to publish for the interface's CURRENT contract, as the
 * served rows can satisfy it — or null when there is none to publish: never
 * captured, captured under another contract, or of unknown contract.
 */
export function currentResponseSchema(schema: unknown, iface: ContractIdentity): unknown {
  return responseSchemaState(schema, iface) === "current" ? servedResponseSchema(schema) : null;
}

/** What a reader is told about a schema or fixture it does not publish. */
export function withheldArtifactNote(state: Exclude<ArtifactState, "current">, iface: ContractIdentity): string {
  return state === "stale"
    ? `Captured under an earlier contract of this interface; it is now v${iface.version}${
        iface.entitySet ? ` on ${iface.entitySet}` : ""
      }. Run it in the Test Console and capture again.`
    : "This capture does not record which contract version it was read under, and that version cannot be established. Run it in the Test Console and capture again.";
}

/** Fixtures for the kit: those of the current contract, and which were withheld and why. */
export function partitionFixtures<F extends ContractStamp & { scenario: string }>(
  fixtures: readonly F[],
  iface: ContractIdentity,
): { current: F[]; withheld: { scenario: string; state: Exclude<ArtifactState, "current"> }[] } {
  const current: F[] = [];
  const withheld: { scenario: string; state: Exclude<ArtifactState, "current"> }[] = [];
  for (const f of fixtures) {
    const state = artifactState(f, iface);
    if (state === "current") current.push(f);
    else withheld.push({ scenario: f.scenario, state });
  }
  return { current, withheld };
}

/**
 * Was the capture request made from a run of the CURRENT contract? A console
 * that predates the field sends none and is judged on the current row, as
 * before; one that names another version is refused (409), because the rows
 * it carries were read under a contract that no longer exists.
 */
export function captureContractMismatch(
  claimed: { interfaceVersion?: number | undefined; entitySet?: string | null | undefined },
  iface: ContractIdentity,
): string | null {
  if (claimed.interfaceVersion === undefined) return null;
  const sameSet = claimed.entitySet === undefined || (claimed.entitySet ?? null) === (iface.entitySet ?? null);
  if (claimed.interfaceVersion === iface.version && sameSet) return null;
  return `This run was against contract v${claimed.interfaceVersion}, and the interface is now v${iface.version}${
    iface.entitySet ? ` on ${iface.entitySet}` : ""
  }. Run it again and capture from the new run.`;
}
