/**
 * Centralized Auth Security Configuration
 * These settings control how users enter the platform.
 */

export const AUTH_SECURITY_CONFIG = {
  // If true, the /signup route is disabled and only invited users can join.
  INVITATION_ONLY: process.env.AUTH_INVITATION_ONLY === "true",

  // List of domains allowed to sign up. Empty array means any domain is allowed.
  // Example: ["abeam.com", "aptus.dev"]
  ALLOWED_DOMAINS: (process.env.AUTH_ALLOWED_DOMAINS || "")
    .split(",")
    .map(d => d.trim())
    .filter(Boolean),

  // If true, whitelisted domains can bypass INVITATION_ONLY mode.
  // This allows internal employees to self-signup while external users must be invited.
  WHITELIST_BYPASS_INVITE: process.env.AUTH_WHITELIST_BYPASS === "true",
};

/**
 * Validates if an email is allowed to register based on the current security policy.
 * Reads env vars fresh on each call to avoid stale module-level values.
 */
export function canRegister(email: string): { allowed: boolean; reason?: string } {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return { allowed: false, reason: "Invalid email format" };

  // Read fresh env vars each call
  const invitationOnly = process.env.AUTH_INVITATION_ONLY === "true";
  const allowedDomains = (process.env.AUTH_ALLOWED_DOMAINS || "")
    .split(",")
    .map(d => d.trim())
    .filter(Boolean);
  const whitelistBypass = process.env.AUTH_WHITELIST_BYPASS === "true";

  const isWhitelisted = allowedDomains.length === 0 ||
                        allowedDomains.includes(domain);

  // Policy 1: Hybrid (Invite only, but whitelisted domains can bypass)
  if (invitationOnly && whitelistBypass) {
    if (isWhitelisted) return { allowed: true };
    return { allowed: false, reason: "Registration is not allowed for this email domain." };
  }

  // Policy 2: Global Invitation Only (No bypass)
  if (invitationOnly) {
    return { allowed: false, reason: "Registration is restricted to invited users only." };
  }

  // Policy 3: Domain Whitelist Check (no invitation-only mode)
  if (!isWhitelisted) {
    return { allowed: false, reason: "Registration is not allowed for this email domain." };
  }

  return { allowed: true };
}
