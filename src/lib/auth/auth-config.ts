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
 */
export function canRegister(email: string): { allowed: boolean; reason?: string } {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return { allowed: false, reason: "Invalid email format" };

  const isWhitelisted = AUTH_SECURITY_CONFIG.ALLOWED_DOMAINS.length === 0 || 
                        AUTH_SECURITY_CONFIG.ALLOWED_DOMAINS.includes(domain);

  // Policy 1: Global Invitation Only (No bypass)
  if (AUTH_SECURITY_CONFIG.INVITATION_ONLY && !AUTH_SECURITY_CONFIG.WHITELIST_BYPASS_INVITE) {
    return { allowed: false, reason: "Registration is restricted to invited users only." };
  }

  // Policy 2: Domain Whitelist Check
  if (!isWhitelisted) {
    return { allowed: false, reason: `Registration is not allowed for domain: ${domain}` };
  }

  // Policy 3: Hybrid (Invite only, but whitelisted domains can skip)
  if (AUTH_SECURITY_CONFIG.INVITATION_ONLY && AUTH_SECURITY_CONFIG.WHITELIST_BYPASS_INVITE && !isWhitelisted) {
    return { allowed: false, reason: "Please use an authorized company email or request an invitation." };
  }

  return { allowed: true };
}
