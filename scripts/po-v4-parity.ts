/**
 * 2608 WS4 (CCC PR-3 §2) — Purchase Orders V2 → V4 parity, READ-ONLY.
 *
 * Runs discover ($metadata), probe ($top=1) and preview ($top=N) against the
 * configured TDD tenant for BOTH the deprecated V2 service
 * (API_PURCHASEORDER_PROCESS_SRV) and its V4 successor (CE_PURCHASEORDER_0001),
 * and prints them side by side. It never writes: the write path is reported
 * as its guard state ({PREFIX}_WRITE_ENABLED / WRITE_SECRET) only.
 *
 * Usage:
 *   pnpm sap:tdd:po-parity            # table
 *   pnpm sap:tdd:po-parity -- --json  # machine-readable
 *
 * Env (same as the connector): S4_TDD_BASE_URL + auth (S4_TDD_AUTH_TYPE …).
 *   PO_PARITY_PREFIX=S4_TDD     env prefix / product tenant to use
 *   PO_PARITY_LIMIT=5           preview rows per entity set
 *
 * Exit codes: 0 ran (parity is printed, not judged — a 403 on V4 is a
 * finding, not a script failure); 2 no tenant configured.
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

import {
  PO_SERVICE_V2_LEGACY,
  PO_SERVICE_V4,
  deriveReadWrite,
  getConfiguredSapTenants,
  getSapTddWriteSecretRequired,
  inspectSapServiceMetadata,
  isSapTddWriteEnabled,
  previewSapEntitySet,
  probeSapEntitySet,
  type SapServiceDefinition,
  type SapTenant,
} from "../src/lib/sap-public/tdd-connector";

interface SideResult {
  service: string;
  apiId: string;
  path: string;
  discover: {
    ok: boolean;
    status: number;
    entitySets: number;
    flavor: string;
    read: boolean;
    write: boolean;
    error?: string;
  };
  probe: {
    entitySet: string;
    ok: boolean;
    status: number;
    durationMs: number;
    resultCount?: number;
    error?: string;
  } | null;
  preview: { entitySet: string; ok: boolean; status: number; rows: number; fields: string[]; error?: string } | null;
}

const PO_ENTITY_SET: Record<string, string> = {
  API_PURCHASEORDER_PROCESS_SRV: "A_PurchaseOrder",
  CE_PURCHASEORDER_0001: "PurchaseOrder",
};

async function runSide(
  prefix: string,
  tenant: SapTenant,
  svc: SapServiceDefinition,
  limit: number,
): Promise<SideResult> {
  const apiId = svc.hubApiId ?? svc.path.split("/").filter(Boolean).pop() ?? svc.key;
  const out: SideResult = {
    service: svc.label,
    apiId,
    path: svc.path,
    discover: { ok: false, status: 0, entitySets: 0, flavor: "-", read: false, write: false },
    probe: null,
    preview: null,
  };
  try {
    const meta = await inspectSapServiceMetadata(prefix, tenant, svc);
    const rw = deriveReadWrite(meta.entityCapabilities);
    out.discover = {
      ok: true,
      status: 200,
      entitySets: meta.entitySets.length,
      flavor: meta.flavor,
      read: rw.read,
      write: rw.write,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    out.discover = {
      ok: false,
      status: Number(message.match(/HTTP (\d{3})/)?.[1] ?? 0),
      entitySets: 0,
      flavor: "-",
      read: false,
      write: false,
      error: message,
    };
    return out; // no $metadata → nothing to probe honestly
  }
  const entitySet = PO_ENTITY_SET[apiId] ?? "PurchaseOrder";
  try {
    const p = await probeSapEntitySet(prefix, tenant, svc, entitySet);
    out.probe = {
      entitySet,
      ok: p.ok,
      status: p.status,
      durationMs: p.durationMs,
      ...(p.resultCount != null ? { resultCount: p.resultCount } : {}),
    };
  } catch (err) {
    out.probe = {
      entitySet,
      ok: false,
      status: 0,
      durationMs: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  try {
    const v = await previewSapEntitySet(prefix, tenant, svc, entitySet, limit);
    out.preview = { entitySet, ok: v.ok, status: v.status, rows: v.rows.length, fields: v.fields };
  } catch (err) {
    out.preview = {
      entitySet,
      ok: false,
      status: 0,
      rows: 0,
      fields: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return out;
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.length ? v.slice(0, 6).join(",") + (v.length > 6 ? ",…" : "") : "—";
  return String(v);
}

async function main(): Promise<void> {
  const prefix = process.env.PO_PARITY_PREFIX ?? "S4_TDD";
  const limit = Number(process.env.PO_PARITY_LIMIT ?? 5);
  const json = process.argv.includes("--json");
  const tenant = getConfiguredSapTenants(prefix)[0];
  if (!tenant) {
    console.error(`No tenant configured for ${prefix}. Set ${prefix}_BASE_URL + auth.`);
    process.exit(2);
  }

  const [v2, v4] = await Promise.all([
    runSide(prefix, tenant, PO_SERVICE_V2_LEGACY, limit),
    runSide(prefix, tenant, PO_SERVICE_V4, limit),
  ]);
  const write = {
    executed: false,
    writeEnabled: isSapTddWriteEnabled(prefix),
    writeSecretRequired: getSapTddWriteSecretRequired(prefix),
    note: "Write is never exercised by this script. It stays behind admin + confirmation + WRITE_SECRET + WRITE_ENABLED (fail-closed).",
  };
  const sharedFields = v2.preview && v4.preview ? v2.preview.fields.filter((f) => v4.preview!.fields.includes(f)) : [];
  const report = {
    tenant: tenant.label,
    prefix,
    at: new Date().toISOString(),
    v2,
    v4,
    sharedPreviewFields: sharedFields,
    write,
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`PO parity — tenant ${tenant.label} (${prefix}) · ${report.at}\n`);
  const rows: Array<[string, unknown, unknown]> = [
    ["apiId", v2.apiId, v4.apiId],
    ["path", v2.path, v4.path],
    [
      "discover",
      `${v2.discover.ok ? "OK" : "FAIL"} HTTP ${v2.discover.status}`,
      `${v4.discover.ok ? "OK" : "FAIL"} HTTP ${v4.discover.status}`,
    ],
    ["  entity sets", v2.discover.entitySets, v4.discover.entitySets],
    ["  metadata flavor", v2.discover.flavor, v4.discover.flavor],
    ["  read / write", `${v2.discover.read}/${v2.discover.write}`, `${v4.discover.read}/${v4.discover.write}`],
    [
      "probe",
      v2.probe ? `${v2.probe.entitySet} HTTP ${v2.probe.status}` : null,
      v4.probe ? `${v4.probe.entitySet} HTTP ${v4.probe.status}` : null,
    ],
    ["preview rows", v2.preview?.rows ?? null, v4.preview?.rows ?? null],
    ["preview fields", v2.preview?.fields ?? null, v4.preview?.fields ?? null],
    ["shared fields", sharedFields.length, sharedFields.length],
    ["write", "not executed", `enabled=${write.writeEnabled} secretRequired=${write.writeSecretRequired}`],
  ];
  for (const [k, a, b] of rows) console.log(`  ${k.padEnd(18)} ${cell(a).padEnd(58)} ${cell(b)}`);
  for (const side of [v2, v4]) {
    for (const e of [side.discover.error, side.probe?.error, side.preview?.error])
      if (e) console.log(`  ! ${side.apiId}: ${e}`);
  }
  console.log(`\n  ${write.note}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
