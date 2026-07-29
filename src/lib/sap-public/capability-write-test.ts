/**
 * Phase 2 — guarded capability write-test (OPT-IN, fail-closed).
 *
 * Proves a service is truly Writable by create-then-delete, ONLY behind the
 * full existing write guard PLUS a dedicated write-test ring:
 *   admin role + confirmation phrase + write secret + WRITE_ENABLED   (existing)
 *   + <PREFIX>_WRITE_TEST_ENABLED=true and the entity set on the ring allowlist.
 *
 * Never auto-run. Test tenant / test-data ring only — never ABeam TDD prod.
 * Only create-then-delete where metadata says the set is creatable AND
 * deletable. Audited via logDecision by the caller.
 */
import {
  createSapEntitySetRecord,
  deleteSapEntityByLocation,
  type SapServiceDefinition,
  type SapTenant,
} from "@/lib/sap-public/tdd-connector";

export const WRITE_TEST_CONFIRMATION = "WRITE TO SAP TDD";

export interface WriteTestGuardInput {
  writeEnabled: boolean; // isSapTddWriteEnabled(prefix)
  /**
   * Is there a session at all? Separate from `isAdmin` ON PURPOSE.
   *
   * These were one boolean, so an authenticated non-admin and an anonymous
   * caller were indistinguishable here and both received 401 "Admin role
   * required" — telling a signed-in user to authenticate, which they already
   * had. A client that treats 401 as "refresh the token and retry" loops
   * forever on a refusal that will never change.
   *
   * Its sibling route probe-all, behind the same requireAdmin, answers 403 for
   * the same caller. Two hand-rolled paths, two different codes, one guard.
   */
  authenticated: boolean;
  isAdmin: boolean; // requireAdmin() passed
  confirmation: string; // must equal WRITE_TEST_CONFIRMATION
  writeSecretValid: boolean; // timing-safe secret match (fail-closed if unset)
  ringEnabled: boolean; // <PREFIX>_WRITE_TEST_ENABLED === "true"
  entitySetAllowed: boolean; // target set on the ring allowlist
}

export interface GuardDecision {
  ok: boolean;
  status: number;
  message: string;
}

/**
 * Fail-closed guard. Returns ok only when EVERY factor passes; otherwise the
 * first failing factor with its HTTP status. Pure + fully unit-testable.
 */
export function assertWriteTestAllowed(input: WriteTestGuardInput): GuardDecision {
  if (!input.writeEnabled) return { ok: false, status: 403, message: "SAP TDD write-back is disabled" };
  // 401 only when there is genuinely nobody to identify. Ordering is preserved:
  // writeEnabled still comes first, so a disabled feature never reveals whether
  // the caller would otherwise have qualified.
  if (!input.authenticated) return { ok: false, status: 401, message: "Not authenticated" };
  if (!input.isAdmin) return { ok: false, status: 403, message: "Admin access required" };
  if (input.confirmation !== WRITE_TEST_CONFIRMATION)
    return { ok: false, status: 400, message: "Confirmation phrase is required" };
  if (!input.writeSecretValid) return { ok: false, status: 403, message: "Invalid SAP write secret" };
  if (!input.ringEnabled)
    return { ok: false, status: 403, message: "Write-test ring not enabled for this product" };
  if (!input.entitySetAllowed)
    return { ok: false, status: 403, message: "Entity set is not on the write-test ring allowlist" };
  return { ok: true, status: 200, message: "ok" };
}

export interface WriteTestResult {
  created: boolean;
  deleted: boolean;
  createStatus: number;
  deleteStatus: number | null;
  location: string | null;
  ladder: "writable" | "reachable";
}

/**
 * Create-then-delete a throwaway record to confirm Writable. Assumes the guard
 * already passed AND the metadata confirmed the set is creatable && deletable
 * (the caller enforces both). Deletes via the create's Location header.
 */
export async function runCapabilityWriteTest(
  prefix: string,
  tenant: SapTenant,
  service: SapServiceDefinition,
  entitySet: string,
  payload: Record<string, unknown>,
): Promise<WriteTestResult> {
  const created = await createSapEntitySetRecord(prefix, tenant, service, entitySet, payload);
  if (!created.ok || !created.location) {
    return {
      created: created.ok,
      deleted: false,
      createStatus: created.status,
      deleteStatus: null,
      location: created.location,
      ladder: created.ok ? "writable" : "reachable",
    };
  }
  const del = await deleteSapEntityByLocation(prefix, tenant, service, created.location);
  return {
    created: true,
    deleted: del.ok,
    createStatus: created.status,
    deleteStatus: del.status,
    location: created.location,
    ladder: "writable",
  };
}
