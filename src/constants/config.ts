/** Application configuration constants */

export const APP_CONFIG = {
  port: 3003,
  sessionMaxAgeHours: 720,
  sessionConcurrentLimit: 1,
  magicLinkExpiryMinutes: 15,
  /*
   * The SAP content release everything grounds on when SAP_CONTENT_RELEASE
   * says nothing (2608 WS7). Flipping it here moves the footer label, the
   * "SAP Best Practices" copy AND every release-scoped catalogue read
   * together — see src/lib/db/content-release-scope.ts. 2602 stays
   * selectable by env, and assessments pinned to a catalogue version keep
   * that version regardless (AD-3).
   */
  sapVersion: "2608",
  pagination: {
    defaultLimit: 50,
    maxLimit: 200,
  },
  fileUpload: {
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedTypes: ["image/png", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
} as const;
