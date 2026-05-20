/**
 * ABeam Workbench — Presales user-agent fingerprint.
 *
 * Used by the per-device OTP gate. The contractual semantic:
 *
 *   "New device" = new browser environment, NOT new IP.
 *
 * IP shifts when the exec moves between corporate Wi-Fi, hotel, mobile
 * data, VPN, etc. Forcing OTP on every IP change is hostile UX and the
 * locked decision rejected it. UA is stable per browser per device, which
 * is the granularity the locked decision intended.
 *
 * Browser auto-updates bump the version number every few weeks. We
 * normalize the version off the browser identifier before hashing so a
 * Chrome 142 → 143 update does not look like a new device. This is a
 * regex strip — a full UA parser dependency is overkill for this single
 * boundary check and a regex covers the ~95% of common UAs we care
 * about.
 *
 * If the device's UA cannot be normalized (empty, missing, garbage), we
 * still produce a deterministic hash — the user will then be re-OTP'd
 * on any UA change. That's intentional: defaulting to safer (more OTPs)
 * over less safe (looser device match) when we can't read the UA.
 */

import { createHash } from 'crypto';

/**
 * Strip version numbers from the major browser product tokens. We keep
 * everything else verbatim (OS, layout-engine, mobile flag, etc.) so two
 * physically different devices with the same browser still hash differently.
 */
export function normalizeUserAgent(ua: string): string {
  if (!ua) return '__missing-ua__';
  return ua
    .replace(/Chrome\/[\d.]+/g, 'Chrome/')
    .replace(/Firefox\/[\d.]+/g, 'Firefox/')
    .replace(/Safari\/[\d.]+/g, 'Safari/')
    .replace(/Version\/[\d.]+/g, 'Version/')
    .replace(/Edg\/[\d.]+/g, 'Edg/')
    .replace(/OPR\/[\d.]+/g, 'OPR/')
    .trim();
}

export function hashUserAgent(ua: string): string {
  return createHash('sha256').update(normalizeUserAgent(ua)).digest('hex');
}
