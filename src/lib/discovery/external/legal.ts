/**
 * ABeam Workbench — Neutral Process Discovery legal / consent versioning.
 *
 * The guest landing records which acknowledgement + PDPA notice the reviewer
 * accepted. Bump these when the copy changes so historical grants pin the
 * version they consented to (stored on DiscoveryAccessGrant.pdpaVersion).
 *
 * Discovery-specific versions rather than Affirm's: the consent copy differs
 * (this surface names no product), so pinning a grant to "affirm-pdpa-v1" would
 * record consent to a notice the reviewer never read.
 */

export const DISCOVERY_ACK_VERSION = "discovery-ack-v1";
export const DISCOVERY_PDPA_VERSION = "discovery-pdpa-v1";

/** Rough time expectation shown on the landing. */
export const DISCOVERY_TIME_EXPECTATION = "about 20 minutes";
