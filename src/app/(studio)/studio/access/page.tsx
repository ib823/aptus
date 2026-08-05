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
  effectiveDecision,
  highestApprovedEnvironment,
  type GrantEnvironment,
} from "@/lib/studio/grants";
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
          solution: { select: { name: true } },
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
    decidedById: r.decidedById,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
    revokedReason: r.revokedReason,
    createdAt: r.createdAt.toISOString(),
  }));

  const highest = highestApprovedEnvironment(
    grants.map((g) => ({ environment: g.environment, decision: g.decision })),
  );

  // Runtime credentials. Metadata only — tokenHash is never selected, so there
  // is no value here that could become a credential.
  const [clientRows, solutionRows, interfaceRows] = await Promise.all([
    organizationId
      ? prisma.solutionClient.findMany({
          where: { organizationId },
          select: {
            id: true,
            solutionId: true,
            label: true,
            environment: true,
            isActive: true,
            lastUsedAt: true,
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
  ]);

  const solutionNames = new Map(solutionRows.map((s) => [s.id, s.name]));

  const requestableInterfaces: RequestableInterface[] = interfaceRows.map((i) => ({
    id: i.id,
    name: i.name,
    solutionId: i.solutionId,
    solutionName: i.solution.name,
    externalId: i.externalId,
    operation: i.operation as RequestableInterface["operation"],
  }));

  const credentials: CredentialSummary[] = clientRows.map((c) => ({
    id: c.id,
    solutionId: c.solutionId,
    solutionName: solutionNames.get(c.solutionId) ?? "(unknown solution)",
    label: c.label,
    environment: c.environment,
    isActive: c.isActive,
    lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
    revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
  }));

  // Marked here so the UI can explain the SoD rule BEFORE it is hit, rather
  // than letting the server refusal be the first the owner hears of it.
  const credentialSolutions: CredentialSolution[] = solutionRows.map((s) => ({
    id: s.id,
    name: s.name,
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
      />

      <ClientCredentials
        credentials={credentials}
        solutions={credentialSolutions}
        canIssue={canMutateStudio(user.role)}
      />
    </div>
  );
}
