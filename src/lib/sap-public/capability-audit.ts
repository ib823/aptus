/**
 * Move 2 — audit trail for the tenant capability probe.
 *
 * Writes one append-only DecisionLogEntry per capabilities request via the
 * shared logDecision() sink, recording the tenant label + exposed/published
 * counts. Never records secrets (no base URL, credentials, or row payloads).
 *
 * Best-effort: a failure here (e.g. audit sink unavailable) must never break
 * the read-only capability response, so the caller wraps this and swallows.
 */
import { logDecision } from "@/lib/audit/decision-logger";
import type { UserRole } from "@/types/assessment";
import type { CapabilitySummary } from "@/lib/sap-public/capability-probe";

export interface CapabilityAuditActor {
  email?: string | null;
  role?: string | null;
}

/**
 * Record a capability-probe run. Uses the `assessmentId: "system"` sentinel
 * (same convention as onboarding / dashboard-widget audits) since a probe has
 * no assessment context. `actor`/`actorRole` fall back to "system" on the
 * public (unauthenticated) path.
 */
export async function auditCapabilityProbe(
  product: { key: string; label: string },
  summary: CapabilitySummary,
  actor: CapabilityAuditActor,
): Promise<void> {
  await logDecision({
    assessmentId: "system",
    entityType: "sap_capability_probe",
    entityId: `${product.key}:${summary.tenant}`,
    action: "SAP_CAPABILITY_PROBED",
    newValue: {
      product: product.key,
      tenantLabel: summary.tenant,
      published: summary.published,
      exposed: summary.exposed,
      notActivated: summary.notActivated,
    },
    actor: actor.email ?? "system",
    actorRole: (actor.role ?? "system") as UserRole,
  });
}
