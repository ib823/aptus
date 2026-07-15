/**
 * ABeam Workbench — Generic user-agent fingerprint.
 *
 * Extracted from the presales per-device OTP gate (src/lib/presales/
 * ua-fingerprint.ts) for reuse by the Affirm external surface. Contractual
 * semantic:
 *
 *   "New device" = new browser environment, NOT new IP.
 *
 * IP shifts when an executive moves between office Wi-Fi, hotel, mobile data,
 * or VPN — forcing OTP on every IP change is hostile UX. UA is stable per
 * browser per device. Browser auto-updates bump the version number, so we
 * strip the version off the major product tokens before hashing (a Chrome
 * 142 → 143 update must not read as a new device). Regex strip covers the
 * common UAs; a full parser dependency is overkill for this one boundary check.
 *
 * When the UA cannot be normalized (empty/garbage) we still produce a
 * deterministic hash — the user is then re-OTP'd on any UA change. Defaulting
 * to safer (more OTPs) over looser device matching is intentional.
 */

import { createHash } from "crypto";

/**
 * Strip version numbers from the major browser product tokens, keeping
 * everything else (OS, engine, mobile flag) so two physically different
 * devices with the same browser still hash differently.
 */
export function normalizeUserAgent(ua: string): string {
  if (!ua) return "__missing-ua__";
  return ua
    .replace(/Chrome\/[\d.]+/g, "Chrome/")
    .replace(/Firefox\/[\d.]+/g, "Firefox/")
    .replace(/Safari\/[\d.]+/g, "Safari/")
    .replace(/Version\/[\d.]+/g, "Version/")
    .replace(/Edg\/[\d.]+/g, "Edg/")
    .replace(/OPR\/[\d.]+/g, "OPR/")
    .trim();
}

export function hashUserAgent(ua: string): string {
  return createHash("sha256").update(normalizeUserAgent(ua)).digest("hex");
}
