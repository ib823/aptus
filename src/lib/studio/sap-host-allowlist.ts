/**
 * A POSITIVE list of hosts a SAP connection may point at.
 *
 * WHAT WAS ALREADY THERE, and why it was not enough. `connection-url-guard.ts`
 * refuses localhost, `.local`, `.internal` and every IP literal — a deny-list.
 * The audit (F25) named the gap exactly: "Validation is a DENY-list, not an
 * allow-list: https is required and localhost/… are refused, but ANY OTHER https
 * host may be saved — there is no positive list of SAP domains."
 *
 * A deny-list answers "is this one of the hosts we know is bad". An allow-list
 * answers "is this one of the hosts SAP actually serves from", and only the
 * second refuses `https://sap-s4-prod.attacker.example`, which passes every
 * existing check.
 *
 * THE ORDERING IS THE SECURITY PROPERTY, and it is the whole point of the
 * capability: the check runs ON SAVE, BEFORE any credential is stored.
 * Validating after storage means the mistake has already happened — the secret
 * is on an unknown host's row, and revoking it is now a cleanup job rather than
 * a refusal.
 *
 * DENY STILL RUNS FIRST. The two are not alternatives: a host must be both
 * not-forbidden and on the list. Keeping the deny-list means a future allowlist
 * entry that is too broad cannot re-admit localhost.
 */

import { isForbiddenBaseUrlHost } from "./connection-url-guard";

/**
 * The suffixes SAP serves its cloud products from.
 *
 * Suffix matching, anchored on a leading dot, so `ondemand.com` admits
 * `my-tenant.s4hana.ondemand.com` and does NOT admit `evil-ondemand.com` — the
 * classic suffix bug, and the reason the comparison below tests for `.suffix`
 * rather than `endsWith(suffix)` alone.
 *
 * DELIBERATELY NOT EXHAUSTIVE, and deliberately overridable. A customer with a
 * private landscape or a partner domain will not be on this list, and a security
 * control that cannot be configured gets removed rather than configured — so
 * `SAP_HOST_ALLOWLIST_EXTRA` adds to it. What is NOT possible is turning it off.
 */
export const SAP_HOST_SUFFIXES: readonly string[] = [
  "ondemand.com", // S/4HANA Cloud, BTP, Integration Suite
  "hana.ondemand.com",
  "s4hana.cloud.sap",
  "cloud.sap",
  "sap.com",
  "successfactors.com",
  "successfactors.eu",
  "ariba.com",
  "sapariba.com",
  "concursolutions.com",
  "fieldglass.net",
];

/** Extra suffixes for private landscapes, comma-separated. Adds; never removes. */
export function configuredExtraSuffixes(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.SAP_HOST_ALLOWLIST_EXTRA;
  if (raw === undefined || raw.trim() === "") return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^\.+/, ""))
    .filter((s) => s.length > 0);
}

export type HostVerdict =
  | { readonly allowed: true; readonly matched: string }
  | { readonly allowed: false; readonly reason: string };

/**
 * Is this URL's host one SAP serves from?
 *
 * Returns a REASON rather than a boolean, because this refusal is shown to a
 * person who is trying to connect a real system and needs to know whether they
 * mistyped, or whether their landscape needs configuring.
 */
export function checkSapHost(url: string, env: NodeJS.ProcessEnv = process.env): HostVerdict {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return { allowed: false, reason: "The URL must use https — credentials travel on every call." };
    }
    host = parsed.hostname.toLowerCase();
  } catch {
    return { allowed: false, reason: "That is not a valid URL." };
  }

  // Deny first. An allowlist entry that is too broad must not re-admit these.
  if (isForbiddenBaseUrlHost(url)) {
    return {
      allowed: false,
      reason:
        "IP literals, localhost and internal names are refused — the broker calls this URL with credentials attached.",
    };
  }

  const suffixes = [...SAP_HOST_SUFFIXES, ...configuredExtraSuffixes(env)];
  for (const suffix of suffixes) {
    /*
     * `host === suffix` OR `host` ends with `.suffix`. Plain endsWith would
     * admit `evil-ondemand.com` for the suffix `ondemand.com`, which is the
     * classic suffix-matching bug and exactly the kind of host this list exists
     * to refuse.
     */
    if (host === suffix || host.endsWith(`.${suffix}`)) {
      return { allowed: true, matched: suffix };
    }
  }

  return {
    allowed: false,
    reason:
      `${host} is not a SAP-served host. If this is a private landscape, add its domain to ` +
      `SAP_HOST_ALLOWLIST_EXTRA — the list can be extended but not switched off.`,
  };
}
