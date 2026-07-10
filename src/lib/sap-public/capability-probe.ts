/**
 * Move 2 — Tenant capability probe.
 *
 * For each published OData service, calls the tenant's $metadata (read-only,
 * no business data pulled) and records whether it is actually exposed. The
 * intersection of "SAP publishes it" (dynamic-catalog) and "the tenant serves
 * it" (this probe) is the tenant's real capability map.
 *
 * A 200 means the communication arrangement for that service is active in the
 * tenant; 403/404 means it is published by SAP but not activated there.
 */
import {
  inspectSapService,
  type SapServiceDefinition,
  type SapTenant,
} from "@/lib/sap-public/tdd-connector";

export interface CapabilityResult {
  service: string;
  label: string;
  scenario: string;
  exposed: boolean;
  status: number;
  entitySetCount?: number;
  error?: string;
}

export interface CapabilitySummary {
  tenant: string;
  published: number;
  exposed: number;
  notActivated: number;
  rows: CapabilityResult[];
}

/** Probe one service via its $metadata. Never throws — failures become rows. */
export async function probeService(
  prefix: string,
  tenant: SapTenant,
  svc: SapServiceDefinition,
): Promise<CapabilityResult> {
  const base = { service: svc.key, label: svc.label, scenario: svc.scenario };
  try {
    const { entitySets } = await inspectSapService(prefix, tenant, svc);
    return { ...base, exposed: true, status: 200, entitySetCount: entitySets.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "probe failed";
    const status = Number(message.match(/HTTP (\d{3})/)?.[1] ?? 0);
    return { ...base, exposed: false, status, error: message };
  }
}

/** Probe many services with bounded concurrency. */
export async function probeTenantCapabilities(
  prefix: string,
  tenant: SapTenant,
  services: SapServiceDefinition[],
  concurrency = 4,
): Promise<CapabilityResult[]> {
  const results: CapabilityResult[] = new Array(services.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < services.length) {
      const i = cursor++;
      const svc = services[i];
      if (!svc) continue;
      results[i] = await probeService(prefix, tenant, svc);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, services.length) }, worker),
  );
  return results;
}

export function summarize(tenant: string, rows: CapabilityResult[]): CapabilitySummary {
  const exposed = rows.filter((r) => r.exposed).length;
  return { tenant, published: rows.length, exposed, notActivated: rows.length - exposed, rows };
}
