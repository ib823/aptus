/**
 * Pinned constants shared by the presales seeder and the integration tests.
 *
 * Single source of truth — both tests/e2e/global-setup.ts (the seeder) and
 * tests/e2e/external-redaction.unauth.spec.ts (the redaction gate test) plus
 * the upcoming decision-write round-trip test import from here. Do not
 * duplicate these values into any other location; if a new test needs them,
 * import here.
 */

/**
 * Pinned UA for the integration tests. The seeder pre-writes an otp_verified
 * audit row whose payload.uaHash equals hashUserAgent(PRESALES_TEST_UA), so
 * the per-device OTP gate accepts requests carrying this user-agent header.
 * Production UAs never collide with this string — it carries the product
 * name and a non-realistic version pattern.
 */
export const PRESALES_TEST_UA = 'ABeam-Presales-E2E/1.0';

/** Pinned bundle id used by the seeder. */
export const PRESALES_TEST_BUNDLE_ID = 'e2e-presales-bundle';

/** Pinned scope code present in the seeded bundle's contentSnapshotJson. */
export const PRESALES_TEST_SCOPE_CODE = 'BD9';

/** Pinned grant id used by the seeder. */
export const PRESALES_TEST_GRANT_ID = 'e2e-presales-grant';
