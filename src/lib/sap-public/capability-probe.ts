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
  inspectSapServiceMetadata,
  probeSapEntitySet,
  type EntityCapability,
  type MetadataFlavor,
  type SapServiceDefinition,
  type SapTenant,
} from "@/lib/sap-public/tdd-connector";
import {
  credentialFailureKind,
  publicCredentialFailure,
  SapCredentialError,
  SapHttpError,
} from "@/lib/sap-public/upstream-failure";

/** Capability ladder derived from a live $metadata probe. */
export type CapabilityLadder = "unreachable" | "reachable" | "readable" | "writable";

export interface CapabilityResult {
  service: string;
  label: string;
  scenario: string;
  exposed: boolean;
  status: number;
  entitySetCount?: number;
  /** Per-entity-set C/R/U/D from $metadata (Phase 2). */
  entities?: EntityCapability[];
  /** unreachable → reachable → readable → writable. */
  ladder?: CapabilityLadder;
  /** How the capability flags were derived (v4 is best-effort). */
  metadataFlavor?: MetadataFlavor;
  /**
   * Data-confirmed tier (opt-in): a real read-only 1-row GET ($top=1) on one
   * entity set returned a data 200 — proving the comm user can READ data, not
   * just reach $metadata. Only ever true on a real data 200; never inferred.
   */
  dataConfirmed?: boolean;
  /**
   * HTTP status of the 1-row data read (when dataProbe ran), 0 when the read was
   * attempted and never answered. Absent means no data read was made.
   */
  dataStatus?: number;
  /** 2608 WS4 — OData protocol of the probed path (V4 for CE_PURCHASEORDER_0001). */
  protocol?: "ODATAV2" | "ODATAV4";
  /** 2608 WS4 — SAP authorisation change to read a 403 by (API_CV_ATTACHMENT_SRV). */
  note?: string;
  /**
   * Set when the TENANT WAS NEVER ASKED: its credential could not be obtained
   * ("refused" — a setup problem; "unavailable" — the token endpoint failed or
   * timed out). `status` is then 0 and says nothing about this service, so a
   * row carrying this is neither "not activated" nor evidence to store.
   */
  credentialError?: "refused" | "unavailable";
  error?: string;
}

/** Pick the entity set to data-confirm: prefer a readable one, else the first. */
function pickReadableEntitySet(entitySets: { name: string }[], caps: EntityCapability[]): string | null {
  const readable = caps.find((c) => c.readable)?.name;
  return readable ?? entitySets[0]?.name ?? null;
}

/**
 * Derive the ladder from a probe. Writable requires an EXPLICIT creatable=true
 * (so V4 best-effort nulls never read as writable). Readable = any readable set.
 */
export function deriveCapabilityLadder(exposed: boolean, entities: EntityCapability[]): CapabilityLadder {
  if (!exposed) return "unreachable";
  const writable = entities.some((e) => e.creatable === true);
  if (writable) return "writable";
  const readable = entities.some((e) => e.readable);
  return readable ? "readable" : "reachable";
}

export interface CapabilitySummary {
  tenant: string;
  published: number;
  exposed: number;
  notActivated: number;
  /** Count of rows per HTTP status (e.g. { "200": 3, "403": 40, "401": 0 }). */
  byStatus: Record<string, number>;
  rows: CapabilityResult[];
}

/** Probe one service via its $metadata. Never throws — failures become rows. */
export async function probeService(
  prefix: string,
  tenant: SapTenant,
  svc: SapServiceDefinition,
  opts: { dataProbe?: boolean } = {},
): Promise<CapabilityResult> {
  const base = {
    service: svc.key,
    label: svc.label,
    scenario: svc.scenario,
    ...(svc.protocol ? { protocol: svc.protocol } : {}),
    ...(svc.authorisationNote ? { note: svc.authorisationNote } : {}),
  };
  try {
    const { entitySets, entityCapabilities, flavor } = await inspectSapServiceMetadata(prefix, tenant, svc);
    const result: CapabilityResult = {
      ...base,
      exposed: true,
      status: 200,
      entitySetCount: entitySets.length,
      entities: entityCapabilities,
      ladder: deriveCapabilityLadder(true, entityCapabilities),
      metadataFlavor: flavor,
    };
    // Data-confirmed tier (opt-in): one read-only 1-row GET on a readable set.
    if (opts.dataProbe) {
      const target = pickReadableEntitySet(entitySets, entityCapabilities);
      if (target) {
        try {
          const p = await probeSapEntitySet(prefix, tenant, svc, target);
          result.dataStatus = p.status;
          result.dataConfirmed = p.ok && p.status === 200 && !p.hasErrorBody;
        } catch {
          result.dataConfirmed = false; // a failed read never confirms data
          // 0 = attempted, never answered — the same convention `status` uses
          // below. Set so that "dataStatus present" means exactly "a data GET
          // left for the tenant", which the console audit row counts.
          result.dataStatus = 0;
        }
      } else {
        result.dataConfirmed = false;
      }
    }
    return result;
  } catch (err) {
    /*
     * "COULD NOT AUTHENTICATE" IS KEPT APART FROM WHAT THE SERVICE ANSWERED
     * (audit A28). The status was read out of the message with /HTTP (\d{3})/,
     * and the message is often the CREDENTIAL step's: a token endpoint's
     * "HTTP 404" became this service's "not activated (not found)", and a
     * missing {PREFIX}_PASSWORD a "no response (timeout/network)" — for every
     * service at once, while no request reached SAP. Probe all then stored
     * that over proven evidence. Only the tenant's own answer, a SapHttpError,
     * carries a status now.
     */
    if (err instanceof SapCredentialError) {
      return {
        ...base,
        exposed: false,
        status: 0,
        ladder: "unreachable",
        credentialError: credentialFailureKind(err) === "refused" ? "refused" : "unavailable",
        error: publicCredentialFailure(err.cause)?.detail ?? err.message,
      };
    }
    const message = err instanceof Error ? err.message : "probe failed";
    const status = err instanceof SapHttpError ? err.status : 0;
    return { ...base, exposed: false, status, ladder: "unreachable", error: message };
  }
}

/** Probe many services with bounded concurrency. */
export async function probeTenantCapabilities(
  prefix: string,
  tenant: SapTenant,
  services: SapServiceDefinition[],
  concurrency = 4,
  opts: { dataProbe?: boolean } = {},
): Promise<CapabilityResult[]> {
  const results: CapabilityResult[] = new Array(services.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < services.length) {
      const i = cursor++;
      const svc = services[i];
      if (!svc) continue;
      results[i] = await probeService(prefix, tenant, svc, opts);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, services.length) }, worker),
  );
  return results;
}

/**
 * `byStatus` keys a row that never reached the tenant as `auth`, not `0`: a
 * `0` reads "no response (timeout/network)", and a credential that could not
 * be obtained is neither. Such a row is not counted as not activated either —
 * nothing was asked of the service.
 */
export function summarize(tenant: string, rows: CapabilityResult[]): CapabilitySummary {
  const exposed = rows.filter((r) => r.exposed).length;
  const unasked = rows.filter((r) => r.credentialError).length;
  const byStatus: Record<string, number> = {};
  for (const r of rows) {
    const key = r.credentialError ? "auth" : String(r.status);
    byStatus[key] = (byStatus[key] ?? 0) + 1;
  }
  return { tenant, published: rows.length, exposed, notActivated: rows.length - exposed - unasked, byStatus, rows };
}
