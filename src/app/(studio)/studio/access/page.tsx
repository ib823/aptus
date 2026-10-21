/**
 * API Access — /studio/access
 *
 * The ledger of who asked for what and who agreed. Expiry AND revocation are
 * resolved for display here rather than by a sweep job: a grant whose expiry
 * has passed reads as EXPIRED immediately, and one revoked in Control Tower
 * reads as REVOKED — so this screen can never show "Approved" for a grant the
 * broker refuses. That exact disagreement shipped once: revocation landed in
 * Control Tower and this page went on rendering the stored decision, so the
 * builder's own ledger contradicted the runtime. The stored row is untouched.
 */

import type { Metadata } from "next";

import {
  AccessGrantsClient,
  type LedgerGrant,
  type RequestableInterface,
} from "@/components/studio/AccessGrantsClient";
import {
  ClientCredentials,
  type CredentialSolution,
  type CredentialSummary,
} from "@/components/studio/ClientCredentials";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  defaultKeyExpiry,
  keyExpiryMode,
  keyMaxTtlDays,
  keyState,
  lacksRequiredExpiry,
  overlapIsOpen,
  rotationOverlapHours,
  storedTokenPrefix,
} from "@/lib/northbound/key-policy";
import {
  effectiveDecision,
  grantsWrite,
  highestApprovedEnvironment,
  isWriteOperation,
  type GrantDecision,
  type GrantEnvironment,
  type GrantOperation,
} from "@/lib/studio/grants";
import { needsReapproval, unboundGrantLabel } from "@/lib/studio/grant-binding";
import { canMutateStudio } from "@/lib/studio/rbac";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "API Access" };

export default async function StudioAccessPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const organizationId = user.organizationId;
  const rows = organizationId
    ? await prisma.apiAccessGrant.findMany({
        where: { organizationId },
        select: {
          id: true,
          externalId: true,
          operation: true,
          environment: true,
          justification: true,
          decision: true,
          requestedById: true,
          decidedById: true,
          decidedAt: true,
          expiresAt: true,
          revokedAt: true,
          revokedReason: true,
          createdAt: true,
          // Which SAP system the grant covers, or why a legacy one covers none (P0.1).
          interfaceId: true,
          sapProduct: true,
          unboundReason: true,
          // Which app the grant is for: the write-key action is offered per
          // credential, on that app's own write grants (P0.3).
          solutionId: true,
          // The owners, so the ledger can say OWN_APP before the click.
          solution: {
            select: { name: true, technicalOwnerId: true, businessOwnerId: true, supportOwnerId: true },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const now = new Date();
  const grants: LedgerGrant[] = rows.map((r) => ({
    id: r.id,
    solutionName: r.solution.name,
    externalId: r.externalId,
    operation: r.operation as LedgerGrant["operation"],
    environment: r.environment as GrantEnvironment,
    justification: r.justification,
    decision: effectiveDecision(
      { decision: r.decision, expiresAt: r.expiresAt, revokedAt: r.revokedAt },
      now,
    ),
    requestedById: r.requestedById,
    viewerOwnsApp: [r.solution.technicalOwnerId, r.solution.businessOwnerId, r.solution.supportOwnerId].includes(
      user.id,
    ),
    decidedById: r.decidedById,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
    revokedReason: r.revokedReason,
    createdAt: r.createdAt.toISOString(),
    sapProduct: r.sapProduct,
    // Only a settled grant that still authorises something, as Control Tower
    // and the requests board flag it: never a rejection or a revocation.
    needsReapproval: needsReapproval(r, now) ? unboundGrantLabel(r.unboundReason) : null,
  }));

  const highest = highestApprovedEnvironment(
    grants.map((g) => ({ environment: g.environment, decision: g.decision })),
  );

  // Runtime credentials. Metadata only — tokenHash is never selected, so there
  // is no value here that could become a credential.
  const [clientRows, solutionRows, interfaceRows, connectionRows, writeKeyRows] = await Promise.all([
    organizationId
      ? prisma.solutionClient.findMany({
          where: { organizationId },
          select: {
            id: true,
            solutionId: true,
            label: true,
            environment: true,
            // The SAP client the credential binds to. Collected at issue,
            // rendered as env/client by the table — and never selected here,
            // so on a multi-client estate the one column that says WHICH data
            // container a credential addresses was always blank.
            sapClient: true,
            tokenPrefix: true,
            // The key's own last four (P0.3, A45): its masked reference.
            tokenTail: true,
            isActive: true,
            lastUsedAt: true,
            // P0.11: the table says when each key stops, and until when the
            // key a rotation replaced still works. Never a hash.
            expiresAt: true,
            previousValidUntil: true,
            revokedAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    organizationId
      ? prisma.solution.findMany({
          where: { organizationId },
          select: {
            id: true,
            name: true,
            /*
             * THE ONLY THING THAT TELLS TWO SOLUTIONS APART. `name` is not
             * unique — the schema constrains `@@unique([organizationId, slug])`
             * and nothing else — so an organization can hold two solutions
             * called the same thing, separated only by slug (`qa-e2e-main` and
             * `qa-e2e-main-2`). That happened, and the credential issued
             * against the wrong twin looked correct everywhere a human could
             * check: the picker, the credentials table and the auto-generated
             * label all showed the name alone. The northbound list came back
             * empty and there was nothing on screen to explain why.
             */
            slug: true,
            technicalOwnerId: true,
            businessOwnerId: true,
            supportOwnerId: true,
          },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    // Interfaces a request may be raised against. The dialog derives externalId
    // and operation from the chosen row rather than accepting them as text: the
    // runtime matches a grant on both, exactly, so a typo would produce a grant
    // that is approved and authorises nothing.
    organizationId
      ? prisma.interface.findMany({
          where: { organizationId },
          select: {
            id: true,
            name: true,
            solutionId: true,
            externalId: true,
            operation: true,
            solution: { select: { name: true } },
          },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    // Environments an active SAP connection actually declares. A grant or a
    // credential can be issued for any of DEV/TEST/PROD, but the runtime binds
    // a call to a connection by that environment — so an environment nothing
    // declares is one every call will be refused on. The pickers say so up
    // front instead of letting the first refused call be the notice.
    organizationId
      ? prisma.sapConnection.findMany({
          where: { organizationId, isActive: true },
          select: { environment: true },
        })
      : Promise.resolve([]),
    // Which credentials carry a write key (P0.3): FILTERED on the sealed column,
    // never selecting it — the ids come back, the key does not.
    organizationId
      ? prisma.solutionClient.findMany({
          where: { organizationId, NOT: { secretsCiphertext: null } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const connectedEnvironments = Array.from(
    new Set(
      connectionRows
        .map((c) => (c.environment ?? "").trim().toUpperCase())
        .filter((e) => e.length > 0),
    ),
  );

  const solutionNames = new Map(solutionRows.map((s) => [s.id, s.name]));
  const solutionSlugs = new Map(solutionRows.map((s) => [s.id, s.slug]));

  const requestableInterfaces: RequestableInterface[] = interfaceRows.map((i) => ({
    id: i.id,
    name: i.name,
    solutionId: i.solutionId,
    solutionName: i.solution.name,
    externalId: i.externalId,
    operation: i.operation as RequestableInterface["operation"],
  }));

  /*
   * Where a write key can be issued (P0.3): a live, approved CREATE or UPDATE
   * grant covers that environment for that solution — the precondition the
   * write-key route checks, by the same predicates (grantsWrite, unexpired,
   * unrevoked). The ledger rows above already carry the effective decision.
   */
  const withWriteKey = new Set(writeKeyRows.map((r) => r.id));
  const writeGrantLanes = new Set(
    rows
      .filter(
        (r) =>
          isWriteOperation(r.operation as GrantOperation) &&
          r.revokedAt === null &&
          (r.expiresAt === null || r.expiresAt.getTime() > now.getTime()) &&
          grantsWrite(r.decision as GrantDecision, r.environment as GrantEnvironment),
      )
      .map((r) => `${r.solutionId}::${r.environment}`),
  );

  const expiryEnforced = keyExpiryMode() === "enforce";
  const credentials: CredentialSummary[] = clientRows.map((c) => ({
    id: c.id,
    solutionId: c.solutionId,
    solutionName: solutionNames.get(c.solutionId) ?? "(unknown solution)",
    solutionSlug: solutionSlugs.get(c.solutionId) ?? null,
    label: c.label,
    environment: c.environment,
    sapClient: c.sapClient,
    isActive: c.isActive,
    lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
    revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
    // Judged here, by the broker's own rule, so the table never calls an
    // expired key active (P0.11).
    state: keyState(c, now),
    tokenPrefix: storedTokenPrefix(c.tokenPrefix),
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
    previousValidUntil:
      c.revokedAt === null && c.previousValidUntil !== null && overlapIsOpen(c.previousValidUntil, now)
        ? c.previousValidUntil.toISOString()
        : null,
    tokenTail: c.tokenTail,
    writeKeyIssued: withWriteKey.has(c.id),
    writeGrantLive: writeGrantLanes.has(`${c.solutionId}::${c.environment}`),
    // The write-key route's gate 5b, by its own predicate and mode, so the
    // row explains the refusal before the click (P0.3 review round 1).
    writeKeyNeedsExpiry: expiryEnforced && lacksRequiredExpiry(c, now),
  }));

  // Marked here so the UI can explain the SoD rule BEFORE it is hit, rather
  // than letting the server refusal be the first the owner hears of it.
  const credentialSolutions: CredentialSolution[] = solutionRows.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    viewerOwns: [s.technicalOwnerId, s.businessOwnerId, s.supportOwnerId].includes(user.id),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 700, letterSpacing: "-0.01em" }}>
          API Access
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)", maxWidth: 760 }}>
          Which capabilities each solution is allowed to consume, and who agreed. These
          decisions are enforced: the runtime checks a live, unexpired, unrevoked grant for
          this capability, operation and environment on every call a solution makes. Expiry
          and revocation both end access — and both are reflected here immediately.
        </p>
      </div>

      <AccessGrantsClient
        grants={grants}
        currentUserId={user.id}
        highestApproved={highest}
        canDecide={canMutateStudio(user.role)}
        canRequest={canMutateStudio(user.role)}
        requestableInterfaces={requestableInterfaces}
        connectedEnvironments={connectedEnvironments}
      />

      <ClientCredentials
        credentials={credentials}
        solutions={credentialSolutions}
        canIssue={canMutateStudio(user.role)}
        connectedEnvironments={connectedEnvironments}
        keyPolicy={{
          maxTtlDays: keyMaxTtlDays(),
          defaultExpiry: defaultKeyExpiry(now).toISOString().slice(0, 10),
          overlapHours: rotationOverlapHours(),
        }}
      />
    </div>
  );
}
