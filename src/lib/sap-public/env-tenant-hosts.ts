/**
 * The SAP host allow-list, applied to the tenants the DEPLOYMENT configures
 * (roadmap P0.14b).
 *
 * THE GAP. A stored connection is checked against `checkSapHost`
 * (lib/studio/sap-host-allowlist.ts) when it is saved, before any credential
 * is stored: https, not an IP literal or an internal name, and on a SAP-served
 * suffix (or SAP_HOST_ALLOWLIST_EXTRA). A tenant configured through
 * `{PREFIX}_BASE_URL` / `{PREFIX}_TENANTS_JSON` (S4_TDD_*, SF_TDD_*,
 * S4_PRIVATE_TDD_*, S4_ONPREM_TDD_*, ECC_TDD_*), its `{PREFIX}_OAUTH_TOKEN_URL`,
 * and Ariba's ARIBA_BASE_URL and ARIBA_OAUTH_TOKEN_URL were never checked:
 * whatever host the environment named was called, with the deployment's
 * credentials attached.
 *
 * THE SAME CHECK, NOT A COPY. Every URL below goes through `checkSapHost`, so
 * a deployment tenant meets exactly the rule a stored connection meets.
 *
 * WHY IT OBSERVES BY DEFAULT. Production's `{PREFIX}_*` values are not in the
 * repository, and the documented examples are not all on the list: the
 * private-cloud, on-premise and ECC prefixes are "usually not internet-
 * reachable" landscapes (.env.example) whose hosts may be a customer domain,
 * plain http, or an IP address, and Ariba's examples (`openapi.ariba.com`,
 * `api.ariba.com`) are on it only because `ariba.com` is. Refusing on deploy
 * could stop a console read that works today. So `COREEDGE_ENV_TENANT_HOSTS`:
 *
 *   observe (default) — every URL is checked; one a stored connection could not
 *                       be saved with is logged once per process and recorded
 *                       on the console call's platform audit row
 *                       (`detail.hostCheck`), and the call goes ahead.
 *   enforce           — such a call is refused 403 HOST_NOT_ALLOWED before
 *                       anything is sent, credential exchange included.
 *   off               — not checked at all.
 *
 * Anything else, a typo included, is observe: a mistyped setting must not
 * start refusing calls. `pnpm coreedge:env-tenant-hosts` prints each
 * configured tenant's verdict (never a secret) so an operator can see what
 * enforce would refuse before switching it on (docs/runbooks/
 * coreedge-console-pipeline.md).
 */

import { checkSapHost } from "@/lib/studio/sap-host-allowlist";

import { getConfiguredSapTenants, SAP_ODATA_PRODUCTS, type SapTenant } from "./tdd-connector";

export type EnvTenantHostMode = "observe" | "enforce" | "off";

export function envTenantHostMode(env: Record<string, string | undefined> = process.env): EnvTenantHostMode {
  const raw = env.COREEDGE_ENV_TENANT_HOSTS?.trim().toLowerCase();
  if (raw === "enforce") return "enforce";
  if (raw === "off") return "off";
  return "observe";
}

/** One URL the deployment configured, by the variable that names it. Never the value of a secret. */
export interface ConfiguredUrl {
  /** The variable (or `{PREFIX}_TENANTS_JSON[key]`) the URL comes from. */
  readonly variable: string;
  readonly url: string;
}

export interface HostFinding {
  readonly variable: string;
  /** The host only: no path, no query, never a credential. */
  readonly host: string;
  readonly reason: string;
}

export interface HostCheck {
  /** Every URL passed, or the check is off. */
  readonly allowed: boolean;
  readonly findings: readonly HostFinding[];
}

const TOKEN_AUTH_TYPES = new Set(["oauth-client-credentials", "oauth-saml-bearer"]);

/**
 * The URLs a call to this deployment tenant is sent to: its base URL, and the
 * token endpoint when the prefix's auth type exchanges a token. The token URL
 * carries the client secret (or the signed assertion), so it is as much a
 * destination as the base URL.
 */
export function deploymentTenantUrls(
  envPrefix: string,
  tenant: Pick<SapTenant, "key" | "baseUrl">,
  env: Record<string, string | undefined> = process.env,
): ConfiguredUrl[] {
  const fromJson = Boolean(env[`${envPrefix}_TENANTS_JSON`]);
  const urls: ConfiguredUrl[] = [
    { variable: fromJson ? `${envPrefix}_TENANTS_JSON[${tenant.key}]` : `${envPrefix}_BASE_URL`, url: tenant.baseUrl },
  ];
  const authType = env[`${envPrefix}_AUTH_TYPE`] ?? "basic";
  const tokenUrl = env[`${envPrefix}_OAUTH_TOKEN_URL`];
  if (TOKEN_AUTH_TYPES.has(authType) && tokenUrl) urls.push({ variable: `${envPrefix}_OAUTH_TOKEN_URL`, url: tokenUrl });
  return urls;
}

/** The URLs an Ariba call is sent to. */
export function aribaUrls(env: Record<string, string | undefined> = process.env): ConfiguredUrl[] {
  return (["ARIBA_BASE_URL", "ARIBA_OAUTH_TOKEN_URL"] as const)
    .filter((variable) => Boolean(env[variable]))
    .map((variable) => ({ variable, url: env[variable]! }));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(not a URL)";
  }
}

/** Each URL against the stored-connection allow-list (checkSapHost), whatever the mode. */
export function checkConfiguredUrls(
  urls: readonly ConfiguredUrl[],
  env: Record<string, string | undefined> = process.env,
): HostCheck {
  const findings: HostFinding[] = [];
  for (const { variable, url } of urls) {
    const verdict = checkSapHost(url, env as NodeJS.ProcessEnv);
    if (!verdict.allowed) findings.push({ variable, host: hostOf(url), reason: verdict.reason });
  }
  return { allowed: findings.length === 0, findings };
}

/**
 * Every deployment tenant this environment configures, with its verdict: what
 * `pnpm coreedge:env-tenant-hosts` prints. A prefix whose TENANTS_JSON will not
 * parse is reported as such rather than thrown, so one bad prefix does not
 * hide the others.
 */
export function auditConfiguredTenantHosts(env: Record<string, string | undefined> = process.env): Array<{
  readonly product: string;
  readonly tenantKey: string;
  readonly check: HostCheck | null;
  readonly error?: string;
}> {
  const out: Array<{ product: string; tenantKey: string; check: HostCheck | null; error?: string }> = [];
  for (const product of SAP_ODATA_PRODUCTS) {
    let tenants: SapTenant[];
    try {
      tenants = getConfiguredSapTenants(product.envPrefix);
    } catch (err) {
      out.push({ product: product.key, tenantKey: "-", check: null, error: err instanceof Error ? err.message : "unreadable" });
      continue;
    }
    for (const tenant of tenants) {
      out.push({ product: product.key, tenantKey: tenant.key, check: checkConfiguredUrls(deploymentTenantUrls(product.envPrefix, tenant, env), env) });
    }
  }
  const ariba = aribaUrls(env);
  if (ariba.length > 0) out.push({ product: "ariba", tenantKey: "ARIBA_*", check: checkConfiguredUrls(ariba, env) });
  return out;
}

/** Hosts already warned about in this process: an observe log line per host, not per call. */
const warned = new Set<string>();

/** Test seam. */
export function forgetEnvTenantHostWarnings(): void {
  warned.clear();
}

/**
 * Log, once per process per variable and host, that a deployment tenant is
 * called on a host a stored connection could not be saved with. Names the
 * variable and the host, never a URL path or a secret.
 */
export function warnUnlistedHosts(check: HostCheck, mode: EnvTenantHostMode, correlationId: string): void {
  for (const f of check.findings) {
    const key = `${f.variable}|${f.host}`;
    if (warned.has(key)) continue;
    warned.add(key);
    console.warn(
      mode === "enforce"
        ? "[env-tenant-hosts] refusing a call to a deployment tenant whose host is not on the SAP host allow-list"
        : "[env-tenant-hosts] a deployment tenant's host is not on the SAP host allow-list; COREEDGE_ENV_TENANT_HOSTS=enforce would refuse this call",
      { variable: f.variable, host: f.host, reason: f.reason, correlationId },
    );
  }
}
