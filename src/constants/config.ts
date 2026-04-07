/** Application configuration constants */

export const APP_CONFIG = {
  port: 3003,
  sessionMaxAgeHours: 24,
  sessionConcurrentLimit: 1,
  magicLinkExpiryMinutes: 15,
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
