/** Application configuration constants */

export const APP_CONFIG = {
  port: 3003,
  sessionMaxAgeHours: 24,
  sessionConcurrentLimit: 1,
  magicLinkExpiryMinutes: 15,
  mfaChallengeExpiryMinutes: 5,
  mfaMaxAttempts: 5,
  totpWindow: 1, // allows 1 step before/after current for clock skew
  totpIssuer: process.env.TOTP_ISSUER ?? "Aptus",
  sapVersion: "2508",
  pagination: {
    defaultLimit: 50,
    maxLimit: 200,
  },
  fileUpload: {
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedTypes: ["image/png", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
} as const;

/** Roles that require MFA (external / client-facing users) */
export const MFA_REQUIRED_ROLES = [
  "process_owner", "it_lead", "data_migration_lead",
  "executive_sponsor", "project_manager", "viewer", "client_admin",
] as const;

/** Roles that can bypass MFA (internal users) */
export const MFA_OPTIONAL_ROLES = [
  "platform_admin", "partner_lead", "consultant", "solution_architect",
] as const;
