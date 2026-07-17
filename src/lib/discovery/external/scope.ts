/**
 * ABeam Workbench — effective stream scope.
 *
 * Two independent scopes, and the effective one is their INTERSECTION:
 *
 *   engagement.valueStreamIds — the SESSION's scope. "This discovery covers
 *                               Source-to-Pay and Record-to-Report."
 *   grant.valueStreamIds      — the PERSONA's scope. "The CFO sees finance."
 *
 * Empty means "no restriction at this level", matching the Affirm grant
 * convention — NOT "nothing".
 *
 * Why the intersection rather than either alone:
 *  - Grant-only (what PR-2a shipped) leaks: a reviewer invited after the session
 *    was scoped would default to all 10 streams, because their grant is empty.
 *  - Engagement-only cannot express a persona: every reviewer would see the
 *    whole session scope.
 * A grant can therefore narrow within the session, and can never widen past it.
 *
 * This is enforced HERE, in the serializer path every /d view goes through — not
 * in the UI. The scoping test asserts a grant listing an out-of-scope stream
 * cannot reach it.
 */

export interface ScopeInput {
  engagementStreamIds: string[];
  grantStreamIds: string[];
}

/**
 * The stream ids a reviewer may actually see, or null for "all".
 * Null is distinct from []: null means unrestricted, [] means nothing is
 * visible, which is a real (if unusual) state — a grant scoped entirely outside
 * its session's scope should show nothing, not everything.
 */
export function effectiveStreamIds(input: ScopeInput): string[] | null {
  const { engagementStreamIds: eng, grantStreamIds: grant } = input;
  if (eng.length === 0 && grant.length === 0) return null;
  if (eng.length === 0) return [...new Set(grant)];
  if (grant.length === 0) return [...new Set(eng)];
  // Both set: the grant may only narrow.
  return [...new Set(grant.filter((id) => eng.includes(id)))];
}

/** True when the session itself is scoped — drives V1's honest scoped note. */
export function isSessionScoped(engagementStreamIds: string[]): boolean {
  return engagementStreamIds.length > 0;
}

export function isStreamInScope(streamId: string, scope: string[] | null): boolean {
  return scope === null || scope.includes(streamId);
}
